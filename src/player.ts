import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { WORLD } from './world';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 5.5;
const RUN_SPEED = 9;

// 玩家是透明的：只有一个第一人称相机，没有身体模型
export class Player {
  readonly controls: PointerLockControls;
  private keys = new Set<string>();
  private velocity = new THREE.Vector2(); // x = 前后, y = 左右
  private bobPhase = 0;

  constructor(private camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    camera.position.set(WORLD.lawnMinX - 2, EYE_HEIGHT, 0);
    camera.lookAt(WORLD.lawnMaxX, EYE_HEIGHT, 0);
    this.controls = new PointerLockControls(camera, dom);

    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.controls.addEventListener('unlock', () => this.keys.clear());
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  get position() {
    return this.camera.position;
  }

  update(dt: number) {
    const k = this.keys;
    const forward = Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown'));
    const right = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;

    const target = new THREE.Vector2(forward, right);
    if (target.lengthSq() > 0) target.normalize().multiplyScalar(speed);
    this.velocity.lerp(target, 1 - Math.exp(-12 * dt));

    this.controls.moveForward(this.velocity.x * dt);
    this.controls.moveRight(this.velocity.y * dt);

    const p = this.camera.position;
    p.x = THREE.MathUtils.clamp(p.x, WORLD.houseFrontX + 0.6, WORLD.graveMaxX);
    p.z = THREE.MathUtils.clamp(p.z, WORLD.lawnMinZ - 0.1, WORLD.playerMaxZ);

    const moving = this.velocity.length() / RUN_SPEED;
    this.bobPhase += dt * this.velocity.length() * 1.8;
    p.y = EYE_HEIGHT + Math.sin(this.bobPhase) * 0.05 * moving;
  }
}
