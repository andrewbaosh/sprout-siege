import * as THREE from 'three';
import { WORLD } from './world';
import type { Game } from './game';
import type { Zombie } from './zombies';
import { Burst, MushroomCloud, Puff } from './effects';

export type PlantKind = 'gatling' | 'doom' | 'sunland';

export const PLANT_INFO: Record<PlantKind, { name: string; price: number; color: string }> = {
  gatling: { name: '机枪射手', price: 40, color: '#4caf32' },
  doom: { name: '毁灭菇', price: 20, color: '#6b3fa0' },
  sunland: { name: '阳光大地', price: 50, color: '#e6a800' },
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

    game.addEffect(new MushroomCloud(this.x, this.z, DOOM_RADIUS));
    for (const z of game.zombies) {
      if (z.hostile && Math.hypot(z.x - this.x, z.z - this.z) <= DOOM_RADIUS) z.ash(game);
    }
    game.addCrater(this.col, this.row);
    this.dead = true; // 一次性植物，炸完就没了
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

export function createPlant(kind: PlantKind, col: number, row: number, x: number, z: number): Plant {
  if (kind === 'gatling') return new Gatling(kind, col, row, x, z);
  if (kind === 'doom') return new DoomShroom(kind, col, row, x, z);
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
