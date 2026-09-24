import * as THREE from 'three';
import { WORLD } from './world';
import type { Hud } from './hud';
import { playCollect } from './audio';

const SUN_VALUE = 30; // 捡一个阳光得 30
const SPAWN_HEIGHT = 14;
const REST_HEIGHT = 0.9;
const FALL_SPEED = 2.4;
const REST_LIFETIME = 12; // 落地后多少秒消失
const PICKUP_RADIUS = 1.5;
const PICKUP_MAX_HEIGHT = 3.2;
const COLLECT_TIME = 0.35;

const coreGeo = new THREE.IcosahedronGeometry(0.42, 2);
const coreMat = new THREE.MeshStandardMaterial({
  color: 0xffd23f,
  emissive: 0xffb300,
  emissiveIntensity: 1.1,
  roughness: 0.4,
});
const rayGeo = new THREE.ConeGeometry(0.12, 0.35, 6);
const haloMat = new THREE.SpriteMaterial({
  map: makeHaloTexture(),
  color: 0xffe27a,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const shadowGeo = new THREE.CircleGeometry(0.55, 24);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });

type State = 'falling' | 'resting' | 'collected';

interface Sun {
  root: THREE.Group; // 始终面向玩家
  spinner: THREE.Group;
  shadow: THREE.Mesh;
  state: State;
  timer: number;
  from: THREE.Vector3;
}

export class SunManager {
  private suns: Sun[] = [];
  private nextSpawn = 1.5;
  private time = 0;

  constructor(private scene: THREE.Scene, private hud: Hud) {}

  update(dt: number, player: THREE.Vector3, spawning: boolean) {
    this.time += dt;
    this.nextSpawn -= dt;
    if (spawning && this.nextSpawn <= 0) {
      const x = THREE.MathUtils.randFloat(WORLD.lawnMinX + 1, WORLD.lawnMaxX - 1);
      const z = THREE.MathUtils.randFloat(WORLD.lawnMinZ + 1, WORLD.lawnMaxZ - 1);
      this.spawn(x, SPAWN_HEIGHT, z);
      this.nextSpawn = 4 + Math.random() * 3;
    }

    for (let i = this.suns.length - 1; i >= 0; i--) {
      const sun = this.suns[i];
      if (this.step(sun, dt, player)) {
        this.scene.remove(sun.root, sun.shadow);
        this.suns.splice(i, 1);
      }
    }
  }

  /** 在地上掉一个阳光（魅惑僵尸死掉时） */
  drop(x: number, z: number) {
    this.spawn(x, 2.5, z);
  }

  private spawn(x: number, y: number, z: number) {
    const root = new THREE.Group();
    const spinner = new THREE.Group();
    spinner.add(new THREE.Mesh(coreGeo, coreMat));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const ray = new THREE.Mesh(rayGeo, coreMat);
      ray.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
      ray.rotation.z = a - Math.PI / 2;
      spinner.add(ray);
    }
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(2.4);
    root.add(spinner, halo);
    root.position.set(x, y, z);

    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, 0.03, z);

    this.scene.add(root, shadow);
    this.suns.push({ root, spinner, shadow, state: 'falling', timer: 0, from: new THREE.Vector3() });
  }

  /** 返回 true 表示这颗阳光该移除了 */
  private step(sun: Sun, dt: number, player: THREE.Vector3): boolean {
    const { root } = sun;
    sun.timer += dt;
    sun.spinner.rotation.z += dt * 1.2;
    root.lookAt(player.x, root.position.y, player.z);

    if (sun.state === 'collected') {
      const t = Math.min(sun.timer / COLLECT_TIME, 1);
      const target = player.clone().add(new THREE.Vector3(0, 0.6, 0));
      root.position.lerpVectors(sun.from, target, t * t);
      root.scale.setScalar(1 - t);
      return t >= 1;
    }

    if (sun.state === 'falling') {
      root.position.y -= FALL_SPEED * dt;
      if (root.position.y <= REST_HEIGHT) {
        root.position.y = REST_HEIGHT;
        sun.state = 'resting';
        sun.timer = 0;
      }
      const closeness = 1 - (root.position.y - REST_HEIGHT) / (SPAWN_HEIGHT - REST_HEIGHT);
      sun.shadow.scale.setScalar(0.4 + 0.6 * closeness);
    } else {
      root.position.y = REST_HEIGHT + Math.sin(this.time * 2 + root.position.x) * 0.12;
      if (sun.timer > REST_LIFETIME) return true;
      // 快消失时闪烁提醒
      root.visible = sun.timer < REST_LIFETIME - 3 || Math.floor(sun.timer * 6) % 2 === 0;
    }

    const dx = player.x - root.position.x;
    const dz = player.z - root.position.z;
    if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS && root.position.y < PICKUP_MAX_HEIGHT) {
      sun.state = 'collected';
      sun.timer = 0;
      sun.from.copy(root.position);
      root.visible = true;
      sun.shadow.visible = false;
      this.hud.addSun(SUN_VALUE);
      playCollect();
    }
    return false;
  }
}

function makeHaloTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,240,160,0.9)');
  grad.addColorStop(0.35, 'rgba(255,210,80,0.45)');
  grad.addColorStop(1, 'rgba(255,200,50,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
