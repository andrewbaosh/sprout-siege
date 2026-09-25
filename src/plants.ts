import * as THREE from 'three';
import { WORLD, tileAt } from './world';
import type { Game } from './game';
import type { Zombie } from './zombies';
import { Burst, MushroomCloud, Puff } from './effects';

export type PlantKind = 'gatling' | 'doom' | 'sunland' | 'cob' | 'electric';

export const PLANT_INFO: Record<PlantKind, { name: string; price: number; color: string }> = {
  gatling: { name: '机枪射手', price: 40, color: '#4caf32' },
  doom: { name: '毁灭菇', price: 20, color: '#6b3fa0' },
  sunland: { name: '阳光大地', price: 50, color: '#e6a800' },
  cob: { name: '玉米加农炮', price: 100, color: '#c0561e' },
  electric: { name: '电能超级机枪豌豆', price: 150, color: '#1e88e5' },
};

const PEA_DAMAGE = 1;
const PEA_SPEED = 14;
const BURST_SIZE = 6; // 机枪射手一次打 6 发
const GATLING_COOLDOWN = 3;
const DOOM_FUSE = 1.2;
const DOOM_RADIUS = 6;
const SUNLAND_COOLDOWN = 7;
const BLACK_HOLE_RADIUS = 3.5;
const BLACK_HOLE_PULL_TIME = 1.6;
const CHARM_CHANCE = 0.5; // 被黑洞吸进去的僵尸：一半变成魅惑僵尸，一半炸成灰
export const COB_COOLDOWN = 20;
const ELECTRIC_COOLDOWN = 3.5;
const ULT_CHANCE = 1; // 每次攻击开启大招的概率（现在是 100%）
const ULT_PEAS = 13; // 大招一次打出的电能豌豆数
const ULT_SPREAD = 0.7; // 大招最大偏角（弧度，约 40°）
const ELECTRIC_KILL_CHANCE = 0.1; // 每颗电能豌豆直接把僵尸电死的概率
export const COB_AREA = 8; // 落点周围 8×8 的正方形范围

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function eyes(group: THREE.Object3D, x: number, y: number, spread: number, size = 0.09) {
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const s of [-1, 1]) {
    group.add(part(new THREE.SphereGeometry(size, 10, 8), white, x, y, s * spread));
    group.add(part(new THREE.SphereGeometry(size * 0.55, 8, 6), black, x + size * 0.6, y, s * spread));
  }
}

function leaves(group: THREE.Object3D, color: number) {
  const mat = std(color);
  for (let i = 0; i < 3; i++) {
    const leaf = part(new THREE.SphereGeometry(0.35, 10, 6), mat);
    leaf.scale.set(1.3, 0.25, 0.6);
    const a = (i / 3) * Math.PI * 2 + 0.4;
    leaf.position.set(Math.cos(a) * 0.35, 0.08, Math.sin(a) * 0.35);
    leaf.rotation.y = -a;
    group.add(leaf);
  }
}

/** 植物模型，面朝 +x（僵尸来的方向）。商店卡槽里的展示模型也用它 */
export function buildPlantModel(kind: PlantKind): { root: THREE.Group; head: THREE.Group } {
  const root = new THREE.Group();
  const head = new THREE.Group();

  if (kind === 'gatling') {
    leaves(root, 0x3f9a2a);
    root.add(part(new THREE.CylinderGeometry(0.09, 0.12, 0.9, 8), std(0x3f9a2a), 0, 0.5, 0));
    head.position.y = 1.15;
    head.add(part(new THREE.SphereGeometry(0.5, 20, 14), std(0x6cd13f)));
    const helmet = part(
      new THREE.SphereGeometry(0.54, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      std(0x2f6d1f),
      0, 0.05, 0,
    );
    head.add(helmet);
    const peak = part(new THREE.BoxGeometry(0.35, 0.06, 0.5), std(0x2f6d1f), 0.45, 0.08, 0);
    head.add(peak);
    // 四管机枪嘴
    const barrelMat = std(0x4a9e2c);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const b = part(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 10), barrelMat, 0.6, Math.sin(a) * 0.14 - 0.1, Math.cos(a) * 0.14);
      b.rotation.z = -Math.PI / 2;
      head.add(b);
    }
    eyes(head, 0.36, 0.2, 0.2);
  } else if (kind === 'doom') {
    root.add(part(new THREE.CylinderGeometry(0.28, 0.34, 0.55, 14), std(0x4a3a6a), 0, 0.28, 0));
    head.position.y = 0.55;
    const cap = part(new THREE.SphereGeometry(0.6, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), std(0x2b1f45, { emissive: 0x2a0a3a }));
    cap.scale.y = 0.9;
    head.add(cap);
    const spotMat = std(0xb28be0, { emissive: 0x6a3aa0 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.38;
      const spot = part(new THREE.SphereGeometry(0.09, 8, 6), spotMat, Math.cos(a) * r, i === 0 ? 0.55 : 0.36, Math.sin(a) * r);
      head.add(spot);
    }
    eyes(root, 0.28, 0.32, 0.12, 0.07);
  } else if (kind === 'electric') {
    // 电能超级机枪豌豆：蓝色大头 + 发光炮管 + 头盔上的闪电
    leaves(root, 0x2a6fb0);
    root.add(part(new THREE.CylinderGeometry(0.1, 0.13, 0.95, 8), std(0x2a6fb0), 0, 0.52, 0));
    head.position.y = 1.22;
    head.add(part(new THREE.SphereGeometry(0.56, 20, 14), std(0x49b8f0, { emissive: 0x0a3050 })));
    const helmetMat = std(0x1d3f7a, { metalness: 0.4 });
    head.add(part(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), helmetMat, 0, 0.05, 0));
    head.add(part(new THREE.BoxGeometry(0.4, 0.06, 0.56), helmetMat, 0.5, 0.08, 0));
    const barrelMat = std(0x7ff6ff, { emissive: 0x2aa0c0 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const b = part(new THREE.CylinderGeometry(0.11, 0.11, 0.7, 10), barrelMat, 0.68, Math.sin(a) * 0.16 - 0.1, Math.cos(a) * 0.16);
      b.rotation.z = -Math.PI / 2;
      if (i === 0) b.name = 'barrel';
      head.add(b);
    }
    const bolt = new THREE.Shape();
    bolt.moveTo(0.05, 0.45);
    bolt.lineTo(-0.12, 0.1);
    bolt.lineTo(0.02, 0.1);
    bolt.lineTo(-0.08, -0.2);
    bolt.lineTo(0.14, 0.18);
    bolt.lineTo(0.0, 0.18);
    bolt.lineTo(0.12, 0.45);
    bolt.closePath();
    const boltMesh = part(
      new THREE.ExtrudeGeometry(bolt, { depth: 0.08, bevelEnabled: false }),
      std(0xffe14a, { emissive: 0xaa8800 }),
      -0.05, 0.62, -0.04,
    );
    head.add(boltMesh);
    eyes(head, 0.42, 0.24, 0.22);
  } else if (kind === 'cob') {
    // 玉米加农炮：绿色小车 + 斜向上的大玉米炮管
    const cartMat = std(0x2f6d1f);
    root.add(part(new THREE.BoxGeometry(1.7, 0.4, 1.0), cartMat, 0, 0.45, 0));
    const wheelMat = std(0x4a3320);
    for (const wx of [-0.6, 0.6]) {
      for (const wz of [-0.55, 0.55]) {
        const wheel = part(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 14), wheelMat, wx, 0.28, wz);
        wheel.rotation.x = Math.PI / 2;
        root.add(wheel);
      }
    }
    const huskMat = std(0x4caf32);
    for (const s of [-1, 1]) {
      const husk = part(new THREE.ConeGeometry(0.3, 1.8, 6), huskMat, -0.1, 0.8, s * 0.42);
      husk.rotation.z = -Math.PI / 2 + 0.55;
      husk.rotation.x = s * 0.25;
      root.add(husk);
    }
    eyes(root, 0.86, 0.5, 0.2, 0.08);
    head.position.set(-0.3, 0.75, 0);
    head.rotation.z = 0.6; // 炮管斜向上对着僵尸那边
    const shell = new THREE.Group();
    shell.name = 'shell';
    shell.position.x = 0.85;
    const cob = part(new THREE.CapsuleGeometry(0.3, 1.2, 6, 14), std(0xffd23f, { emissive: 0x3a2800 }));
    cob.rotation.z = -Math.PI / 2;
    shell.add(cob);
    const kernelMat = std(0xffe680, { emissive: 0x3a2a00 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 6) * Math.PI * 2;
      shell.add(part(new THREE.SphereGeometry(0.07, 6, 5), kernelMat, -0.5 + Math.floor(i / 6) * 0.45, Math.cos(a) * 0.29, Math.sin(a) * 0.29));
    }
    head.add(shell);
    const ready = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.25, 40),
      new THREE.MeshBasicMaterial({ color: 0x9dff7a, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    ready.rotation.x = -Math.PI / 2;
    ready.position.y = 0.05;
    ready.name = 'ready';
    root.add(ready);
  } else {
    // 阳光大地：全黄的玉米投手 + 背后的黑洞
    leaves(root, 0xe6b422);
    const yellow = std(0xffd23f, { emissive: 0x4a3500 });
    const cob = part(new THREE.CapsuleGeometry(0.34, 0.6, 6, 14), yellow, 0, 0.8, 0);
    root.add(cob);
    const kernelMat = std(0xffe680, { emissive: 0x3a2a00 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 7) * Math.PI * 2;
      const y = 0.55 + (i % 2) * 0.35 + 0.1;
      root.add(part(new THREE.SphereGeometry(0.07, 6, 5), kernelMat, Math.cos(a) * 0.33, y, Math.sin(a) * 0.33));
    }
    const huskMat = std(0xf2c230);
    for (const s of [-1, 1]) {
      const husk = part(new THREE.ConeGeometry(0.16, 0.9, 6), huskMat, 0, 0.75, s * 0.32);
      husk.rotation.x = s * 0.35;
      root.add(husk);
    }
    eyes(root, 0.32, 0.95, 0.13, 0.08);
    // 投掷臂：从头顶伸向后方，末端是小篮子
    head.position.set(0, 1.25, 0);
    head.add(part(new THREE.BoxGeometry(0.9, 0.07, 0.07), huskMat, -0.45, 0.05, 0));
    const basket = part(new THREE.CylinderGeometry(0.16, 0.1, 0.12, 10, 1, true), huskMat, -0.9, 0.12, 0);
    head.add(basket);
    // 背后的黑洞
    const hole = buildBlackHole(0.28);
    hole.position.set(-0.75, 1.35, 0);
    hole.name = 'hole';
    root.add(hole);
  }

  root.add(head);
  return { root, head };
}

/** 黑洞造型：黑色球体 + 发光的吸积盘 */
export function buildBlackHole(radius: number) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  const disk = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.2, radius * 2.4, 32),
    new THREE.MeshBasicMaterial({
      color: 0xb070ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  disk.rotation.x = Math.PI / 2 - 0.35;
  disk.name = 'disk';
  g.add(disk);
  return g;
}

export abstract class Plant {
  readonly group: THREE.Group;
  protected head: THREE.Group;
  hp = 10;
  dead = false;
  private flash = 0;

  constructor(readonly kind: PlantKind, readonly col: number, readonly row: number, readonly x: number, readonly z: number) {
    const { root, head } = buildPlantModel(kind);
    this.group = root;
    this.head = head;
    root.position.set(x, 0, z);
  }

  /** 被僵尸啃 */
  hit(damage: number, _game: Game) {
    this.hp -= damage;
    this.flash = 0.15;
    if (this.hp <= 0) this.dead = true;
  }

  update(dt: number, game: Game) {
    this.flash = Math.max(0, this.flash - dt);
    this.group.scale.setScalar(this.flash > 0 ? 0.9 : 1);
    this.tick(dt, game);
  }

  protected abstract tick(dt: number, game: Game): void;
}

export class Gatling extends Plant {
  private cooldown = 0.5;
  private burstLeft = 0;
  private burstTimer = 0;
  private recoil = 0;

  protected tick(dt: number, game: Game) {
    this.cooldown -= dt;
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        game.addProjectile(new Pea(new THREE.Vector3(this.x + 0.9, 1.05, this.z)));
        this.burstLeft--;
        this.burstTimer = 0.09;
        this.recoil = 0.12;
      }
    } else if (this.cooldown <= 0 && game.firstHostileInLane(this.z, this.x)) {
      this.burstLeft = BURST_SIZE;
      this.burstTimer = 0;
      this.cooldown = GATLING_COOLDOWN;
    }
    this.recoil = Math.max(0, this.recoil - dt);
    this.head.position.x = -this.recoil;
  }
}

export class DoomShroom extends Plant {
  private fuse = DOOM_FUSE;

  protected tick(dt: number, game: Game) {
    this.fuse -= dt;
    const k = 1 - this.fuse / DOOM_FUSE;
    this.group.scale.setScalar(1 + k * 0.5 + Math.sin(k * 40) * 0.08 * k);
    if (this.fuse > 0) return;

    this.dead = true; // 一次性植物，炸完就没了
    game.addEffect(new MushroomCloud(this.x, this.z, DOOM_RADIUS));
    for (const z of game.zombies) {
      if (z.hostile && Math.hypot(z.x - this.x, z.z - this.z) <= DOOM_RADIUS) z.ash(game);
    }
    game.addCrater(this.col, this.row);
  }
}

export class Sunland extends Plant {
  private cooldown = 1.5;
  private throwAnim = 0;
  private hole = this.group.getObjectByName('hole')!;

  protected tick(dt: number, game: Game) {
    this.hole.getObjectByName('disk')!.rotation.z += dt * 3;
    this.cooldown -= dt;
    this.throwAnim = Math.max(0, this.throwAnim - dt);
    this.head.rotation.z = -Math.sin((this.throwAnim / 0.4) * Math.PI) * 1.2;

    if (this.cooldown > 0) return;
    const target = game.firstHostileInLane(this.z, this.x);
    if (!target) return;
    this.cooldown = SUNLAND_COOLDOWN;
    this.throwAnim = 0.4;
    // 预判一点僵尸的前进
    const aim = new THREE.Vector3(Math.max(target.x - target.speed * 1.1, this.x + 1), 0, target.z);
    game.addProjectile(new BlackHoleShot(new THREE.Vector3(this.x - 0.5, 1.6, this.z), aim));
  }
}

/** 玉米加农炮：不会自己攻击，玩家走过去连上它，再到目标位置按 E 发射 */
export class CobCannon extends Plant {
  cooldown = 0;
  linked = false;
  playerInside = false; // 用来判断玩家“刚走到”炮旁边
  private recoil = 0;
  private shell = this.group.getObjectByName('shell')!;
  private ready = this.group.getObjectByName('ready') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

  get isReady() {
    return this.cooldown <= 0;
  }

  fire(target: THREE.Vector3, game: Game) {
    this.cooldown = COB_COOLDOWN;
    this.recoil = 0.5;
    const muzzle = new THREE.Vector3();
    this.shell.getWorldPosition(muzzle);
    game.addProjectile(new CobShell(muzzle, target.clone().setY(0)));
  }

  protected tick(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    // 冷却时炮管上的玉米慢慢长回来
    const grown = 1 - this.cooldown / COB_COOLDOWN;
    this.shell.scale.setScalar(this.isReady ? 1 : 0.2 + 0.6 * grown);
    this.recoil = Math.max(0, this.recoil - dt);
    this.head.rotation.z = 0.6 + Math.sin((this.recoil / 0.5) * Math.PI) * 0.25;

    const pulse = 0.55 + Math.sin(performance.now() / 200) * 0.25;
    this.ready.material.color.setHex(this.linked ? 0xffd23f : this.isReady ? 0x9dff7a : 0x888888);
    this.ready.material.opacity = this.linked ? pulse + 0.2 : this.isReady ? pulse : 0.4;
  }
}

/** 电能超级机枪豌豆：电能豌豆无视护甲、有概率直接电死；攻击时开大招扇形散射 */
export class ElectricGatling extends Plant {
  private cooldown = 0.5;
  private queue: number[] = []; // 待发射的豌豆角度
  private shotTimer = 0;
  private shotInterval = 0.05;
  private barrel = this.head.getObjectByName('barrel') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  private time = Math.random() * 10;

  protected tick(dt: number, game: Game) {
    this.time += dt;
    this.cooldown -= dt;

    if (this.queue.length > 0) {
      this.shotTimer -= dt;
      if (this.shotTimer <= 0) {
        const angle = this.queue.shift()!;
        this.head.rotation.y = -angle; // 炮口跟着转
        const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const muzzle = new THREE.Vector3(this.x, 1.1, this.z).addScaledVector(dir, 1);
        game.addProjectile(new ElectricPea(muzzle, dir));
        this.shotTimer = this.shotInterval;
      }
    } else {
      this.head.rotation.y *= 1 - Math.min(1, dt * 6);
      if (this.cooldown <= 0 && game.hostileAhead(this.x, this.z, ULT_SPREAD)) {
        this.cooldown = ELECTRIC_COOLDOWN;
        if (Math.random() < ULT_CHANCE) {
          // 大招：从正前方开始，一左一右依次往两边散开
          const step = ULT_SPREAD / ((ULT_PEAS - 1) / 2);
          this.queue = [0];
          for (let i = 1; this.queue.length < ULT_PEAS; i++) this.queue.push(i * step, -i * step);
          this.shotInterval = 0.05;
        } else {
          this.queue = [0, 0, 0, 0, 0, 0];
          this.shotInterval = 0.09;
        }
        this.shotTimer = 0;
      }
    }

    const charging = this.queue.length > 0 ? 1.5 : 0.6 + Math.sin(this.time * 4) * 0.3;
    this.barrel.material.emissiveIntensity = charging;
  }
}

export function createPlant(kind: PlantKind, col: number, row: number, x: number, z: number): Plant {
  if (kind === 'electric') return new ElectricGatling(kind, col, row, x, z);
  if (kind === 'gatling') return new Gatling(kind, col, row, x, z);
  if (kind === 'doom') return new DoomShroom(kind, col, row, x, z);
  if (kind === 'cob') return new CobCannon(kind, col, row, x, z);
  return new Sunland(kind, col, row, x, z);
}

/** 在场景里飞的东西，update 返回 true 表示结束 */
export interface Projectile {
  obj: THREE.Object3D;
  update(dt: number, game: Game): boolean;
}

const peaGeo = new THREE.SphereGeometry(0.16, 10, 8);
const peaMat = new THREE.MeshStandardMaterial({ color: 0x7ee04a, emissive: 0x1f4a10 });

export class Pea implements Projectile {
  obj: THREE.Mesh;

  constructor(pos: THREE.Vector3) {
    this.obj = new THREE.Mesh(peaGeo, peaMat);
    this.obj.position.copy(pos);
    this.obj.castShadow = true;
  }

  update(dt: number, game: Game) {
    const p = this.obj.position;
    p.x += PEA_SPEED * dt;
    for (const z of game.zombies) {
      if (z.hostile && Math.abs(z.x - p.x) < 0.45 && Math.abs(z.z - p.z) < 0.9) {
        z.hit(PEA_DAMAGE, game);
        game.addEffect(new Puff(p.clone(), 0x9be86a, 0.35, 0.2));
        return true;
      }
    }
    return p.x > WORLD.lawnMaxX + 3;
  }
}

class BlackHoleShot implements Projectile {
  obj = buildBlackHole(0.22);
  private t = 0;
  private duration: number;

  constructor(private from: THREE.Vector3, private to: THREE.Vector3) {
    this.duration = 0.6 + from.distanceTo(to) * 0.04;
    this.obj.position.copy(from);
  }

  update(dt: number, game: Game) {
    this.t += dt;
    const k = Math.min(this.t / this.duration, 1);
    this.obj.position.lerpVectors(this.from, this.to, k);
    this.obj.position.y = THREE.MathUtils.lerp(this.from.y, 1.2, k) + 5 * 4 * k * (1 - k) * 0.5;
    this.obj.getObjectByName('disk')!.rotation.z += dt * 6;
    if (k < 1) return false;
    game.addProjectile(new BlackHoleVortex(this.to.clone().setY(1.2)));
    return true;
  }
}

/** 黑洞落地：把周围的僵尸吸进来，然后爆炸 */
class BlackHoleVortex implements Projectile {
  obj = buildBlackHole(0.3);
  private t = 0;
  private captured = new Set<Zombie>();

  constructor(pos: THREE.Vector3) {
    this.obj.position.copy(pos);
    const disk = this.obj.getObjectByName('disk') as THREE.Mesh;
    disk.rotation.x = Math.PI / 2;
  }

  update(dt: number, game: Game) {
    this.t += dt;
    const grow = Math.min(this.t / 0.3, 1);
    this.obj.scale.setScalar(0.5 + grow * 2);
    this.obj.getObjectByName('disk')!.rotation.z += dt * 10;

    for (const z of game.zombies) {
      if (!z.hostile || this.captured.has(z)) continue;
      if (Math.hypot(z.x - this.obj.position.x, z.z - this.obj.position.z) <= BLACK_HOLE_RADIUS) {
        this.captured.add(z);
        z.state = 'pulled';
        z.pullTarget.copy(this.obj.position);
      }
    }

    if (this.t < BLACK_HOLE_PULL_TIME) return false;

    game.addEffect(new Burst(this.obj.position.clone(), BLACK_HOLE_RADIUS));
    for (const z of this.captured) {
      if (z.state !== 'pulled') continue; // 途中已经被打死了
      if (Math.random() < CHARM_CHANCE) z.charm(game);
      else z.ash(game);
    }
    return true;
  }
}

/** 玉米炮弹：先冲上天，停一下，再砸到目标位置 */
class CobShell implements Projectile {
  obj = new THREE.Group();
  private cob: THREE.Group;
  private marker: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private t = 0;
  private static UP = 0.9;
  private static HANG = 0.7;
  private static DOWN = 0.8;

  constructor(private from: THREE.Vector3, private target: THREE.Vector3) {
    this.cob = new THREE.Group();
    const body = part(new THREE.CapsuleGeometry(0.35, 1.3, 6, 14), std(0xffd23f, { emissive: 0x5a4000 }));
    this.cob.add(body);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 1, 10),
      new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flame.position.y = -1.2;
    flame.rotation.x = Math.PI;
    this.cob.add(flame);
    this.cob.position.copy(from);
    // 落点的预警框
    this.marker = new THREE.Mesh(
      new THREE.PlaneGeometry(COB_AREA, COB_AREA),
      new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.set(target.x, 0.05, target.z);
    this.obj.add(this.cob, this.marker);
  }

  update(dt: number, game: Game) {
    this.t += dt;
    const { UP, HANG, DOWN } = CobShell;
    const t = this.t;
    if (t < UP) {
      const k = t / UP;
      this.cob.position.set(this.from.x, this.from.y + k * k * 40, this.from.z);
      return false;
    }
    if (t < UP + HANG) {
      this.cob.visible = false;
      this.marker.material.opacity = ((t - UP) / HANG) * 0.25;
      return false;
    }
    const k = Math.min((t - UP - HANG) / DOWN, 1);
    this.cob.visible = true;
    this.cob.rotation.x = Math.PI; // 头朝下
    this.cob.position.set(this.target.x, 40 * (1 - k * k) + 0.5, this.target.z);
    this.marker.material.opacity = 0.25 + Math.sin(t * 30) * 0.1;
    if (k < 1) return false;

    this.explode(game);
    return true;
  }

  private explode(game: Game) {
    const center = this.target;
    game.addEffect(new Burst(center.clone().setY(0.8), COB_AREA * 0.6, 0xffa040));
    for (let i = 0; i < 8; i++) {
      const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * COB_AREA, 0.5, (Math.random() - 0.5) * COB_AREA));
      game.addEffect(new Puff(p, 0x6b625a, 1.4, 1.2));
    }
    const half = COB_AREA / 2;
    for (const z of game.zombies) {
      if (!z.hostile || Math.abs(z.x - center.x) > half || Math.abs(z.z - center.z) > half) continue;
      // 戴着铁桶的炸不飞，但会被炸死；普通僵尸直接炸飞
      if (z.armor > 0) z.die(game);
      else z.launch(game, center);
    }
    const tile = tileAt(center.x, center.z);
    if (tile) game.addCrater(tile.col, tile.row);
  }
}

const electricGeo = new THREE.SphereGeometry(0.17, 10, 8);
const electricMat = new THREE.MeshBasicMaterial({ color: 0xc8ffff });
const sparkMat = new THREE.SpriteMaterial({
  map: makeGlowTexture('rgba(120,240,255,1)'),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

/** 电能豌豆：可以斜着飞，打中无视护甲，有概率直接电死 */
class ElectricPea implements Projectile {
  obj = new THREE.Group();
  private spark: THREE.Sprite;

  constructor(pos: THREE.Vector3, private dir: THREE.Vector3) {
    this.obj.add(new THREE.Mesh(electricGeo, electricMat));
    this.spark = new THREE.Sprite(sparkMat);
    this.spark.scale.setScalar(0.9);
    this.obj.add(this.spark);
    this.obj.position.copy(pos);
  }

  update(dt: number, game: Game) {
    const p = this.obj.position;
    p.addScaledVector(this.dir, PEA_SPEED * dt);
    this.spark.scale.setScalar(0.7 + Math.random() * 0.5); // 噼啪闪烁
    for (const z of game.zombies) {
      if (!z.hostile || Math.hypot(z.x - p.x, z.z - p.z) > 0.65) continue;
      const killed = z.zap(PEA_DAMAGE, ELECTRIC_KILL_CHANCE, game);
      game.addEffect(killed ? new Burst(p.clone(), 1.4, 0x7ff6ff) : new Puff(p.clone(), 0x7ff6ff, 0.4, 0.2));
      return true;
    }
    return p.x > WORLD.lawnMaxX + 3 || Math.abs(p.z) > WORLD.lawnMaxZ + 3;
  }
}

function makeGlowTexture(color: string) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
