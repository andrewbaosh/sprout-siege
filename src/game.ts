import * as THREE from 'three';
import { WORLD, TILE_H, TILE_W, laneZ, tileAt, tileCenter } from './world';
import type { Hud } from './hud';
import { SunManager } from './sun';
import { Shop } from './shop';
import { Zombie, type ZombieKind } from './zombies';
import { PLANT_INFO, createPlant, type Plant, type PlantKind, type Projectile } from './plants';
import type { Effect } from './effects';

// 第一波：普通僵尸 + 铁桶僵尸，最后 4 只是“一大波”
const WAVE_1: ZombieKind[] = [
  'normal', 'normal', 'normal', 'bucket', 'normal', 'normal', 'bucket', 'normal',
  'normal', 'bucket', 'normal', 'bucket',
];
const FINAL_RUSH = 4;
const FIRST_RELEASE = 20; // 开局给玩家 20 秒准备
const CROWD_SIZE = 8;
const CRATER_TIME = 60; // 弹坑一分钟后修复
const START_SUN = 50;

interface Crater {
  col: number;
  row: number;
  obj: THREE.Group;
  timer: number;
}

/** 能挡住僵尸、被僵尸啃的东西 */
interface Blocker {
  x: number;
  z: number;
  hit(damage: number, game: Game): void;
}

export class Game {
  zombies: Zombie[] = [];
  plants: Plant[] = [];
  projectiles: Projectile[] = [];
  effects: Effect[] = [];
  craters: Crater[] = [];
  readonly suns: SunManager;
  private shop: Shop;

  held: PlantKind | null = null;
  state: 'playing' | 'won' | 'lost' = 'playing';

  private pending = [...WAVE_1]; // 还没在墓地出现的僵尸
  private released = 0;
  private nextRelease = FIRST_RELEASE;
  private elapsed = 0;
  private animTime = 0;
  private highlight: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(private scene: THREE.Scene, private hud: Hud, private onEnd: (won: boolean) => void) {
    this.suns = new SunManager(scene, hud);
    this.shop = new Shop(scene);
    hud.setSun(START_SUN);

    for (let i = 0; i < CROWD_SIZE; i++) this.spawnCrowdZombie(false);

    this.highlight = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE_W - 0.2, TILE_H - 0.2),
      new THREE.MeshBasicMaterial({ color: 0x9dff7a, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.visible = false;
    scene.add(this.highlight);
    this.updateHud();
  }

  get remaining() {
    return this.pending.length + this.zombies.filter((z) => !z.charmed && z.alive).length;
  }

  update(dt: number, playing: boolean, player: THREE.Vector3) {
    this.animTime += dt;

    if (!playing || this.state !== 'playing') {
      // 暂停时只让墓地里的僵尸原地摇晃
      for (const z of this.zombies) if (z.state === 'idle') z.update(dt, this.animTime, this);
      return;
    }

    this.elapsed += dt;
    this.releaseZombies(dt);
    this.suns.update(dt, player, true);

    const entered = this.shop.update(dt, player, this.hud.sun);
    if (entered) this.takeFromShop(entered);

    for (const p of this.plants) p.update(dt, this);
    this.plants = this.plants.filter((p) => {
      if (p.dead) this.scene.remove(p.group);
      return !p.dead;
    });

    // 遍历副本：黑洞落地时会往列表里加入新的漩涡
    for (const p of [...this.projectiles]) {
      if (p.update(dt, this)) {
        this.scene.remove(p.obj);
        this.projectiles.splice(this.projectiles.indexOf(p), 1);
      }
    }

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      const result = z.update(dt, this.animTime, this);
      if (result === 'remove') {
        this.scene.remove(z.group);
        this.zombies.splice(i, 1);
      } else if (result === 'entered') {
        this.end(false);
        return;
      }
    }

    for (const e of [...this.effects]) {
      if (e.update(dt)) {
        this.scene.remove(e.obj);
        this.effects.splice(this.effects.indexOf(e), 1);
      }
    }

    this.updateCraters(dt);
    this.updateHighlight(player);
    this.updateHud();

    if (this.remaining === 0) this.end(true);
  }

  // ---------- 给植物和僵尸调用的接口 ----------

  addSun(amount: number) {
    this.hud.addSun(amount);
  }

  addEffect(e: Effect) {
    this.effects.push(e);
    this.scene.add(e.obj);
  }

  addProjectile(p: Projectile) {
    this.projectiles.push(p);
    this.scene.add(p.obj);
  }

  addCrater(col: number, row: number) {
    const { x, z } = tileCenter(col, row);
    const obj = new THREE.Group();
    const pit = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshStandardMaterial({ color: 0x2a1d12 }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.y = 0.03;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.22, 8, 32), new THREE.MeshStandardMaterial({ color: 0x5a4128 }));
    rim.rotation.x = -Math.PI / 2;
    rim.scale.z = 0.6;
    obj.add(pit, rim);
    obj.position.set(x, 0, z);
    this.scene.add(obj);
    this.craters.push({ col, row, obj, timer: CRATER_TIME });
  }

  /** 植物射程内（同一行、在植物前方、已经在草坪上）最靠前的敌对僵尸 */
  firstHostileInLane(z: number, x: number): Zombie | null {
    let best: Zombie | null = null;
    for (const zb of this.zombies) {
      if (!zb.hostile || Math.abs(zb.z - z) > 1.0) continue;
      if (zb.x < x - 0.3 || zb.x > WORLD.lawnMaxX + 1.2) continue;
      if (!best || zb.x < best.x) best = zb;
    }
    return best;
  }

  /** 僵尸前方挡路的东西：敌对僵尸会被植物和魅惑僵尸挡住，魅惑僵尸会被敌对僵尸挡住 */
  findBlocker(z: Zombie): Blocker | null {
    if (z.charmed) {
      for (const o of this.zombies) {
        if (o.hostile && o.state === 'walking' && Math.abs(o.z - z.z) < 1 && o.x - z.x >= 0 && o.x - z.x < 1) return o;
      }
      return null;
    }
    for (const p of this.plants) {
      if (Math.abs(p.z - z.z) < 1.2 && z.x - p.x > -0.2 && z.x - p.x < 0.9) return p;
    }
    for (const o of this.zombies) {
      if (o.fightingAlly && Math.abs(o.z - z.z) < 1 && z.x - o.x >= 0 && z.x - o.x < 1) return o;
    }
    return null;
  }

  // ---------- 玩家操作 ----------

  /** 按 E：把手上的植物种在脚下的格子里 */
  tryPlant(player: THREE.Vector3) {
    if (this.state !== 'playing') return;
    if (!this.held) {
      this.hud.toast('手上没有植物，先去右边的卡槽光束里拿一个');
      return;
    }
    const tile = tileAt(player.x, player.z);
    if (!tile) {
      this.hud.toast('要站在草坪的格子上才能种');
      return;
    }
    const blocked = this.tileBlocked(tile.col, tile.row);
    if (blocked) {
      this.hud.toast(blocked);
      return;
    }
    const { x, z } = tileCenter(tile.col, tile.row);
    const plant = createPlant(this.held, tile.col, tile.row, x, z);
    this.plants.push(plant);
    this.scene.add(plant.group);
    this.held = null;
    this.hud.setHeld(null);
  }

  /** 按 Q：把手上的植物放回去，退还阳光 */
  returnHeld() {
    if (!this.held || this.state !== 'playing') return;
    this.addSun(PLANT_INFO[this.held].price);
    this.hud.toast(`已放回${PLANT_INFO[this.held].name}，退还 ${PLANT_INFO[this.held].price} 阳光`);
    this.held = null;
    this.hud.setHeld(null);
  }

  private takeFromShop(kind: PlantKind) {
    const info = PLANT_INFO[kind];
    if (this.held) {
      this.hud.toast(`手上已经有${PLANT_INFO[this.held].name}了，先按 E 种下（或按 Q 放回）`);
      return;
    }
    if (this.hud.sun < info.price) {
      this.hud.toast(`阳光不够，买${info.name}还差 ${info.price - this.hud.sun} 阳光`);
      return;
    }
    this.hud.addSun(-info.price);
    this.held = kind;
    this.hud.setHeld(info.name);
  }

  private tileBlocked(col: number, row: number): string | null {
    if (this.plants.some((p) => p.col === col && p.row === row)) return '这个格子已经有植物了';
    const crater = this.craters.find((c) => c.col === col && c.row === row);
    if (crater) return `弹坑里种不了植物，还要 ${Math.ceil(crater.timer)} 秒才能修复`;
    return null;
  }

  // ---------- 内部 ----------

  private spawnCrowdZombie(rise: boolean) {
    const kind = this.pending.shift();
    if (!kind) return;
    const z = new Zombie(kind);
    z.group.position.set(
      THREE.MathUtils.randFloat(WORLD.graveMinX + 2, WORLD.graveMaxX - 1),
      0,
      THREE.MathUtils.randFloat(-9, 9),
    );
    z.group.rotation.y = -Math.PI / 2 + THREE.MathUtils.randFloat(-0.4, 0.4); // 面朝小屋
    if (rise) z.rise();
    this.scene.add(z.group);
    this.zombies.push(z);
  }

  private releaseZombies(dt: number) {
    this.nextRelease -= dt;
    if (this.nextRelease > 0) return;

    const idle = this.zombies.filter((z) => z.state === 'idle');
    if (idle.length === 0) {
      this.nextRelease = 1;
      return;
    }
    const z = idle[Math.floor(Math.random() * idle.length)];
    const lz = laneZ(Math.floor(Math.random() * WORLD.lanes));
    z.waypoints = [
      new THREE.Vector3(WORLD.lawnMaxX + 1, 0, lz),
      new THREE.Vector3(WORLD.lawnMinX - 0.5, 0, lz),
      new THREE.Vector3(WORLD.houseFrontX + 1, 0, WORLD.doorZ),
      new THREE.Vector3(WORLD.houseFrontX - 1.8, 0, WORLD.doorZ), // 穿过门洞进屋
    ];
    z.speed = THREE.MathUtils.randFloat(0.9, 1.3);
    z.state = 'walking';
    this.released++;
    this.spawnCrowdZombie(true); // 墓地里再爬出一只补位

    const rushStart = WAVE_1.length - FINAL_RUSH;
    if (this.released === rushStart) this.hud.toast('一大波僵尸正在接近！', 5000);
    this.nextRelease = this.released >= rushStart ? 2.5 : Math.max(6, 10 - this.released * 0.6);
  }

  private updateCraters(dt: number) {
    this.craters = this.craters.filter((c) => {
      c.timer -= dt;
      if (c.timer < 5) c.obj.scale.setScalar(Math.max(0.01, c.timer / 5)); // 最后 5 秒慢慢长回草地
      if (c.timer <= 0) this.scene.remove(c.obj);
      return c.timer > 0;
    });
  }

  private updateHighlight(player: THREE.Vector3) {
    const tile = this.held ? tileAt(player.x, player.z) : null;
    this.highlight.visible = !!tile;
    if (!tile) return;
    const { x, z } = tileCenter(tile.col, tile.row);
    this.highlight.position.set(x, 0.04, z);
    this.highlight.material.color.setHex(this.tileBlocked(tile.col, tile.row) ? 0xff6a50 : 0x9dff7a);
  }

  private updateHud() {
    this.hud.setRemaining(this.remaining);
  }

  private end(won: boolean) {
    this.state = won ? 'won' : 'lost';
    this.highlight.visible = false;
    this.onEnd(won);
  }
}
