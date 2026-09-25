import * as THREE from 'three';
import { WORLD } from './world';
import type { Game } from './game';
import { FallingObject, Puff } from './effects';

export type ZombieKind = 'normal' | 'bucket' | 'giant' | 'imp';

export const ZOMBIE_HP = 6; // 普通僵尸挨 6 发豌豆
export const BUCKET_ARMOR = 12; // 铁桶再挡 12 发
const GIANT_HP = 1000;
const GIANT_THROW_HP = 300; // 血量低于这个就把背上的小鬼扔出去
export const GIANT_INSTAKILL_DAMAGE = 300; // 秒杀类攻击对巨人只造成这么多伤害
const IMP_HP = 3;
const GIANT_SCALE = 2.2;
const IMP_SCALE = 0.6;
const IMP_THROW_DISTANCE = 12;
const HP_BAR_W = 0.9;
export const KILL_REWARD: Record<ZombieKind, number> = { normal: 10, bucket: 20, giant: 50, imp: 5 };
/** 出发时的移动速度范围 */
export const ZOMBIE_SPEED: Record<ZombieKind, [number, number]> = {
  normal: [0.9, 1.3],
  bucket: [0.9, 1.3],
  giant: [0.45, 0.55],
  imp: [3, 3.4],
};
const BITE_DAMAGE = 1;
const BITE_INTERVAL = 1;

type State = 'rising' | 'idle' | 'walking' | 'pulled' | 'launched' | 'thrown' | 'dying' | 'ash';
export type ZombieResult = 'remove' | 'entered' | null;

const COLORS = {
  skin: 0x9bbf7a,
  pants: 0x3d4250,
  tie: 0xa32424,
  shirts: [0x7a5a3e, 0x4f6178, 0x6e3a3a, 0x5b6b3f],
  charmedSkin: 0xf2d36b,
  charmedShirt: 0xe8a93a,
};
const EYE_WHITE = new THREE.MeshBasicMaterial({ color: 0xf4f1dc });
const DARK = new THREE.MeshBasicMaterial({ color: 0x151515 });
const BUCKET_MAT = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.7, roughness: 0.35 });
const HALO_MAT = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 });

export class Zombie {
  readonly group = new THREE.Group(); // 位置 + 朝向
  private body = new THREE.Group(); // 死亡倒地、摇晃等动画
  private head = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private skinMat: THREE.MeshStandardMaterial;
  private shirtMat: THREE.MeshStandardMaterial;
  private pantsMat: THREE.MeshStandardMaterial;
  private bucket: THREE.Mesh | null = null;
  private halo: THREE.Mesh | null = null;
  private imp: Zombie | null = null; // 巨人背上的小鬼
  private hpBar: THREE.Sprite | null = null;
  private hpBarBg: THREE.Sprite | null = null;
  private smashTimer = 0;
  private throwTimer = -1; // >= 0 表示正在扔小鬼
  private flightFrom = new THREE.Vector3();
  private flightTo = new THREE.Vector3();

  state: State = 'idle';
  hp = ZOMBIE_HP;
  armor = 0;
  charmed = false;
  speed = 1;
  waypoints: THREE.Vector3[] = [];
  pullTarget = new THREE.Vector3();
  private launchVel = new THREE.Vector3();

  private phase = Math.random() * 10;
  private timer = 0;
  private biteTimer = 0;
  private flash = 0;
  private zapped = false; // 被电死的：倒下时一直冒蓝光

  constructor(readonly kind: ZombieKind) {
    this.skinMat = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.9 });
    this.shirtMat = new THREE.MeshStandardMaterial({
      color: COLORS.shirts[Math.floor(Math.random() * COLORS.shirts.length)],
      roughness: 0.9,
    });
    this.pantsMat = new THREE.MeshStandardMaterial({ color: COLORS.pants, roughness: 0.9 });
    const tieMat = new THREE.MeshStandardMaterial({ color: COLORS.tie, roughness: 0.9 });

    // 模型面朝 +z，通过 group.rotation.y 转向
    for (const [leg, x] of [[this.legL, -0.2], [this.legR, 0.2]] as const) {
      leg.position.set(x, 0.95, 0);
      const m = box(0.28, 0.95, 0.3, this.pantsMat);
      m.position.y = -0.475;
      leg.add(m);
      this.body.add(leg);
    }

    const torso = box(0.85, 1.0, 0.5, this.shirtMat);
    torso.position.y = 1.45;
    const tie = box(0.12, 0.6, 0.02, tieMat);
    tie.position.set(0, 1.55, 0.26);
    tie.visible = kind !== 'imp';
    this.body.add(torso, tie);

    this.head.position.set(0, 1.95, 0.05);
    this.head.rotation.z = (Math.random() - 0.5) * 0.4;
    const skull = box(0.62, 0.62, 0.6, this.skinMat);
    skull.position.y = 0.31;
    this.head.add(skull);
    for (const s of [-1, 1]) {
      const eye = box(0.17, 0.17, 0.02, EYE_WHITE);
      eye.position.set(s * 0.14, 0.4, 0.31);
      const pupil = box(0.07, 0.07, 0.02, DARK);
      pupil.position.set(s * 0.14 + (Math.random() - 0.5) * 0.08, 0.39 + (Math.random() - 0.5) * 0.06, 0.325);
      this.head.add(eye, pupil);
    }
    const mouth = box(0.3, 0.06, 0.02, DARK);
    mouth.position.set(0.03, 0.14, 0.31);
    this.head.add(mouth);
    this.body.add(this.head);

    if (kind === 'bucket') {
      this.armor = BUCKET_ARMOR;
      this.bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.6, 14), BUCKET_MAT);
      this.bucket.castShadow = true;
      this.bucket.position.y = 0.72;
      this.bucket.rotation.z = -0.12;
      this.head.add(this.bucket);
    }

    for (const [arm, x] of [[this.armL, -0.55], [this.armR, 0.55]] as const) {
      arm.position.set(x, 1.85, 0);
      const sleeve = box(0.22, 0.8, 0.22, this.shirtMat);
      sleeve.position.y = -0.4;
      const hand = box(0.2, 0.2, 0.2, this.skinMat);
      hand.position.y = -0.9;
      arm.add(sleeve, hand);
      this.body.add(arm);
    }

    this.group.add(this.body);

    if (kind === 'giant') this.buildGiant();
    if (kind === 'imp') {
      this.hp = IMP_HP;
      this.group.scale.setScalar(IMP_SCALE);
      this.skinMat.color.set(0xa8c77e);
      this.shirtMat.color.set(0xb8a88a);
    }
  }

  /** 巨人：放大身体，右手拖着电线杆，背上背着小鬼，头顶有血条 */
  private buildGiant() {
    this.hp = GIANT_HP;
    this.group.scale.setScalar(GIANT_SCALE);
    this.shirtMat.color.set(0x5a4632);
    const pole = box(0.14, 1.1, 0.14, new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 }));
    pole.position.y = -1.45;
    this.armR.add(pole);

    this.imp = new Zombie('imp');
    this.imp.group.scale.setScalar(IMP_SCALE / GIANT_SCALE);
    this.imp.group.position.set(0, 1.45, -0.42);
    this.body.add(this.imp.group);

    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x331111, depthTest: false }));
    bg.scale.set(HP_BAR_W + 0.04, 0.1, 1);
    bg.position.y = 2.75;
    this.hpBar = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x6adf3a, depthTest: false }));
    this.hpBar.center.set(0, 0.5);
    this.hpBar.scale.set(HP_BAR_W, 0.07, 1);
    this.hpBar.position.set(-HP_BAR_W / 2, 2.75, 0);
    bg.renderOrder = 10;
    this.hpBar.renderOrder = 11;
    this.hpBarBg = bg;
    this.group.add(bg, this.hpBar);
  }

  get isGiant() {
    return this.kind === 'giant';
  }

  /** 身体半宽：用来判断子弹有没有打中 */
  get radius() {
    return this.isGiant ? 1.0 : this.kind === 'imp' ? 0.3 : 0.45;
  }

  /** 离挡路的东西多近就停下来攻击 */
  get reach() {
    return this.isGiant ? 2.0 : 0.9;
  }

  get x() {
    return this.group.position.x;
  }
  get z() {
    return this.group.position.z;
  }

  /** 在草坪上、会被植物攻击的敌对僵尸 */
  get hostile() {
    return !this.charmed && (this.state === 'walking' || this.state === 'pulled');
  }

  /** 会动、会打架的魅惑僵尸 */
  get fightingAlly() {
    return this.charmed && this.state === 'walking';
  }

  get alive() {
    return this.state !== 'dying' && this.state !== 'ash' && this.state !== 'launched';
  }

  /** 被巨人扔出去：飞一段抛物线后落地开跑 */
  throwTo(from: THREE.Vector3, to: THREE.Vector3) {
    this.flightFrom.copy(from);
    this.flightTo.copy(to);
    this.group.position.copy(from);
    this.state = 'thrown';
    this.timer = 0;
  }

  rise() {
    this.state = 'rising';
    this.timer = 0;
    this.group.position.y = -2.2;
  }

  hit(damage: number, game: Game) {
    if (!this.alive) return;
    this.flash = 0.1;
    if (this.armor > 0) {
      this.armor -= damage;
      if (this.armor <= 0) {
        this.armor = 0;
        this.dropBucket(game);
      }
      return;
    }
    this.hp -= damage;
    if (this.hp <= 0) this.die(game);
  }

  /** 被打死：倒下 */
  die(game: Game) {
    if (!this.alive) return;
    this.state = 'dying';
    this.timer = 0;
    this.reward(game);
  }

  /**
   * 被电能豌豆打中：直接扣本体血（无视铁桶），并有概率不管剩多少血直接电死。
   * 返回是否被电死。
   */
  zap(damage: number, killChance: number, game: Game): boolean {
    if (!this.alive) return false;
    this.flash = 0.1;
    if (Math.random() < killChance) {
      if (this.isGiant) {
        this.hit(GIANT_INSTAKILL_DAMAGE, game);
        return false;
      }
      this.zapped = true;
      this.die(game);
      return true;
    }
    this.hp -= damage;
    if (this.hp <= 0) this.die(game);
    return false;
  }

  /** 被玉米加农炮炸飞：飞上天再摔下来 */
  launch(game: Game, from: THREE.Vector3) {
    if (!this.alive) return;
    if (this.isGiant) {
      this.hit(GIANT_INSTAKILL_DAMAGE, game);
      return;
    }
    const away = this.group.position.clone().sub(from).setY(0);
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize().multiplyScalar(THREE.MathUtils.randFloat(3, 6));
    this.launchVel.set(away.x, THREE.MathUtils.randFloat(10, 13), away.z);
    this.state = 'launched';
    this.timer = 0;
    this.reward(game);
  }

  /** 被炸成灰 */
  ash(game: Game) {
    if (!this.alive) return;
    if (this.isGiant) {
      this.hit(GIANT_INSTAKILL_DAMAGE, game);
      return;
    }
    this.state = 'ash';
    this.timer = 0;
    this.group.position.y = 0;
    for (const m of [this.skinMat, this.shirtMat, this.pantsMat]) {
      m.color.set(0x1e1b19);
      m.emissive.set(0x000000);
    }
    if (this.bucket) this.bucket.material = this.pantsMat;
    this.reward(game);
  }

  /** 变成阳光魅惑僵尸：掉转方向，走回墓地，路上攻击僵尸 */
  charm(game: Game) {
    if (!this.alive) return;
    if (this.isGiant) {
      this.hit(GIANT_INSTAKILL_DAMAGE, game);
      return;
    }
    this.dropBucket(game);
    this.charmed = true;
    this.hp = ZOMBIE_HP;
    this.state = 'walking';
    this.group.position.y = 0;
    this.skinMat.color.set(COLORS.charmedSkin);
    this.shirtMat.color.set(COLORS.charmedShirt);
    for (const m of [this.skinMat, this.shirtMat, this.pantsMat]) m.emissive.set(0x4a3300);
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 24), HALO_MAT);
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = 0.95;
    this.head.add(this.halo);
    this.waypoints = [new THREE.Vector3(WORLD.graveMinX + 1, 0, this.z)];
  }

  private reward(game: Game) {
    if (this.charmed) game.suns.drop(this.x, this.z); // 魅惑僵尸死了掉一个阳光
    else game.addSun(KILL_REWARD[this.kind]);
  }

  private dropBucket(game: Game) {
    if (!this.bucket) return;
    const world = new THREE.Vector3();
    this.bucket.getWorldPosition(world);
    this.head.remove(this.bucket);
    this.bucket.position.copy(world);
    game.addEffect(new FallingObject(this.bucket));
    this.bucket = null;
    this.armor = 0;
  }

  update(dt: number, time: number, game: Game): ZombieResult {
    const g = this.group;
    this.timer += dt;

    this.flash = Math.max(0, this.flash - dt);
    const zapFlicker = this.zapped && this.timer < 1.2 && Math.random() < 0.6;
    const glow = zapFlicker ? 0x2299ff : this.flash > 0 ? 0x555555 : this.charmed ? 0x4a3300 : 0x000000;
    if (this.state !== 'ash') for (const m of [this.skinMat, this.shirtMat, this.pantsMat]) m.emissive.setHex(glow);
    if (this.halo) this.halo.rotation.z += dt * 2;
    if (this.hpBar) {
      const k = Math.max(0, this.hp) / GIANT_HP;
      this.hpBar.scale.x = HP_BAR_W * k;
      this.hpBar.material.color.setHex(this.hp < GIANT_THROW_HP ? 0xe8452c : 0x6adf3a);
      this.hpBar.visible = this.hpBarBg!.visible = this.alive;
    }

    switch (this.state) {
      case 'rising': {
        const t = Math.min(this.timer / 1.6, 1);
        g.position.y = -2.2 * (1 - t) * (1 - t);
        this.body.rotation.z = Math.sin(this.timer * 30) * 0.05 * (1 - t);
        if (t >= 1) this.state = 'idle';
        return null;
      }
      case 'idle':
        this.body.rotation.z = Math.sin(time * 1.3 + this.phase) * 0.06;
        this.armL.rotation.x = -1.1 + Math.sin(time * 1.1 + this.phase) * 0.2;
        this.armR.rotation.x = this.isGiant ? -0.3 : -1.1 + Math.sin(time * 1.3 + this.phase + 1) * 0.2;
        return null;
      case 'thrown': {
        const t = Math.min(this.timer / 1.1, 1);
        g.position.lerpVectors(this.flightFrom, this.flightTo, t);
        g.position.y = THREE.MathUtils.lerp(this.flightFrom.y, 0, t) + 6 * 4 * t * (1 - t) * 0.5;
        this.body.rotation.x = -t * Math.PI * 2; // 空中翻跟头
        if (t >= 1) {
          g.position.y = 0;
          this.body.rotation.x = 0;
          this.state = 'walking';
          this.waypoints = game.houseRoute(this.z);
          game.addEffect(new Puff(g.position.clone().setY(0.2), 0x8a7a5a, 0.6, 0.3));
        }
        return null;
      }
      case 'dying': {
        const t = Math.min(this.timer / 0.6, 1);
        this.body.rotation.x = -Math.PI / 2 * t * t;
        if (this.timer > 1.2) g.position.y -= dt * 1.5;
        return this.timer > 2 ? 'remove' : null;
      }
      case 'ash': {
        const t = Math.min(this.timer / 1.1, 1);
        this.body.scale.set(1 + t * 0.3, 1 - t * 0.95, 1 + t * 0.3);
        if (this.timer > 0.9 && this.timer - dt <= 0.9) {
          game.addEffect(new Puff(g.position.clone().setY(0.4), 0x2a2522, 1.2, 0.6));
        }
        return t >= 1 ? 'remove' : null;
      }
      case 'launched': {
        this.launchVel.y -= 14 * dt;
        g.position.addScaledVector(this.launchVel, dt);
        this.body.rotation.x += dt * 9;
        this.body.rotation.z += dt * 4;
        if (g.position.y <= 0 && this.launchVel.y < 0) {
          // 摔在地上，接着播放倒地后的下沉
          g.position.y = 0;
          this.body.rotation.set(-Math.PI / 2, 0, 0);
          this.state = 'dying';
          this.timer = 0.6;
          game.addEffect(new Puff(g.position.clone().setY(0.3), 0x8a7a5a, 0.8, 0.4));
        }
        return null;
      }
      case 'pulled': {
        const d = this.pullTarget.clone().sub(g.position).setY(0);
        const step = 3 * dt;
        if (d.length() > step) g.position.addScaledVector(d.normalize(), step);
        g.position.y = Math.min(g.position.y + dt * 0.8, 0.8);
        g.rotation.y += dt * 8;
        this.body.rotation.z = 0.4;
        return null;
      }
      case 'walking':
        return this.walk(dt, game);
    }
  }

  private walk(dt: number, game: Game): ZombieResult {
    const g = this.group;
    g.position.y = 0;
    this.body.rotation.z = 0;

    if (this.imp && (this.throwTimer >= 0 || this.hp < GIANT_THROW_HP)) return this.throwImp(dt, game);

    const blocker = game.findBlocker(this);
    if (blocker && this.isGiant) {
      // 举起电线杆，一棒子砸下去
      this.faceToward(blocker.x - this.x, blocker.z - this.z, dt);
      this.legL.rotation.x = this.legR.rotation.x = 0;
      const before = this.smashTimer;
      this.smashTimer += dt;
      const t = this.smashTimer;
      if (t < 0.8) this.armR.rotation.x = THREE.MathUtils.lerp(-0.3, -3.0, t / 0.8);
      else if (t < 0.95) this.armR.rotation.x = THREE.MathUtils.lerp(-3.0, -0.6, (t - 0.8) / 0.15);
      else this.armR.rotation.x = -0.6;
      if (before < 0.95 && t >= 0.95) {
        blocker.hit(9999, game);
        game.addEffect(new Puff(new THREE.Vector3(blocker.x, 0.4, blocker.z), 0x8a7a5a, 1.4, 0.4));
      }
      if (t > 1.5) this.smashTimer = 0;
      return null;
    }
    this.smashTimer = 0;
    if (blocker) {
      // 停下来啃
      this.phase += dt * 10;
      this.head.rotation.x = Math.sin(this.phase) * 0.2;
      this.armL.rotation.x = -Math.PI / 2 + Math.sin(this.phase) * 0.3;
      this.armR.rotation.x = -Math.PI / 2 - Math.sin(this.phase) * 0.3;
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.faceToward(blocker.x - this.x, blocker.z - this.z, dt);
      this.biteTimer += dt;
      if (this.biteTimer >= BITE_INTERVAL) {
        this.biteTimer = 0;
        blocker.hit(BITE_DAMAGE, game);
      }
      return null;
    }
    this.biteTimer = 0;
    this.head.rotation.x = 0;

    const target = this.waypoints[0];
    const dx = target.x - g.position.x;
    const dz = target.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    const step = this.speed * dt;
    if (dist <= step) {
      g.position.x = target.x;
      g.position.z = target.z;
      this.waypoints.shift();
      if (this.waypoints.length === 0) {
        if (this.charmed) {
          game.addEffect(new Puff(g.position.clone().setY(1), 0xffe27a, 1, 0.5));
          return 'remove';
        }
        return 'entered';
      }
    } else {
      g.position.x += (dx / dist) * step;
      g.position.z += (dz / dist) * step;
      this.faceToward(dx, dz, dt);
    }

    // 僵硬的行走：双臂前伸，腿前后摆
    this.phase += dt * this.speed * 3.5;
    this.body.rotation.z = Math.sin(this.phase) * 0.05;
    g.position.y = Math.abs(Math.sin(this.phase)) * 0.06;
    this.legL.rotation.x = Math.sin(this.phase) * 0.5;
    this.legR.rotation.x = -Math.sin(this.phase) * 0.5;
    this.armL.rotation.x = -Math.PI / 2 + Math.sin(this.phase * 0.5) * 0.12;
    this.armR.rotation.x = -Math.PI / 2 - Math.sin(this.phase * 0.5) * 0.12;
    if (this.isGiant) {
      // 巨人拖着电线杆走
      this.armR.rotation.x = -0.3 + Math.sin(this.phase) * 0.08;
      this.armL.rotation.x = -Math.sin(this.phase) * 0.4;
    }
    return null;
  }

  /** 巨人把背上的小鬼往前扔 */
  private throwImp(dt: number, game: Game): ZombieResult {
    if (this.throwTimer < 0) this.throwTimer = 0;
    const before = this.throwTimer;
    this.throwTimer += dt;
    const t = this.throwTimer;
    this.legL.rotation.x = this.legR.rotation.x = 0;
    this.armL.rotation.x = t < 0.6 ? THREE.MathUtils.lerp(0, -2.8, t / 0.6) : THREE.MathUtils.lerp(-2.8, -1.2, Math.min(1, (t - 0.6) / 0.2));
    if (before < 0.6 && t >= 0.6 && this.imp) {
      const imp = this.imp;
      const from = new THREE.Vector3();
      imp.group.getWorldPosition(from);
      this.body.remove(imp.group);
      imp.group.scale.setScalar(IMP_SCALE);
      imp.group.rotation.y = this.group.rotation.y;
      const toX = Math.max(this.x - IMP_THROW_DISTANCE, WORLD.houseFrontX + 4);
      imp.throwTo(from, new THREE.Vector3(toX, 0, this.z));
      imp.speed = THREE.MathUtils.randFloat(...ZOMBIE_SPEED.imp);
      game.addZombie(imp);
      this.imp = null;
    }
    if (t > 1) this.throwTimer = -1;
    return null;
  }

  private faceToward(dx: number, dz: number, dt: number) {
    const yaw = Math.atan2(dx, dz);
    let diff = yaw - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, dt * 5);
  }
}

function box(w: number, h: number, d: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}
