import * as THREE from 'three';

/** 一次性的视觉特效：update 返回 true 时由 Game 从场景中移除 */
export interface Effect {
  obj: THREE.Object3D;
  update(dt: number): boolean;
}

const fade = (color: number, opacity = 1, additive = false) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

/** 毁灭菇的蘑菇云 */
export class MushroomCloud implements Effect {
  obj = new THREE.Group();
  private t = 0;
  private stem: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private cap: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private flash: THREE.PointLight;
  private hot = new THREE.Color(0xffb347);
  private smoke = new THREE.Color(0x5b5552);

  constructor(x: number, z: number, private radius: number) {
    this.obj.position.set(x, 0, z);
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 5, 16, 1, true), fade(0xffb347, 0.9));
    this.stem.position.y = 2.5;
    this.cap = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 14), fade(0xffb347, 0.95));
    this.cap.scale.y = 0.6;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), fade(0xffe0a0, 0.8, true));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.1;
    this.flash = new THREE.PointLight(0xffa040, 400, 30);
    this.flash.position.y = 4;
    this.obj.add(this.stem, this.cap, this.ring, this.flash);
    this.obj.scale.setScalar(0.01);
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const grow = Math.min(t / 0.5, 1);
    this.obj.scale.setScalar(0.2 + 0.8 * (1 - (1 - grow) ** 3));
    this.cap.position.y = 5 + t * 0.8;

    const cool = Math.min(t / 1.2, 1);
    const color = this.hot.clone().lerp(this.smoke, cool);
    this.stem.material.color.copy(color);
    this.cap.material.color.copy(color);

    const alpha = t < 1.5 ? 0.95 : Math.max(0, 0.95 - (t - 1.5) / 1.5);
    this.stem.material.opacity = alpha * 0.85;
    this.cap.material.opacity = alpha;

    const r = Math.min(t / 0.6, 1) * this.radius;
    this.ring.scale.setScalar(r);
    this.ring.material.opacity = Math.max(0, 0.8 - t);
    this.flash.intensity = Math.max(0, 400 * (1 - t / 0.8));
    return t > 3;
  }
}

/** 黑洞爆炸的闪光 */
export class Burst implements Effect {
  obj: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private t = 0;

  constructor(pos: THREE.Vector3, private radius: number, color = 0xc8a0ff) {
    this.obj = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), fade(color, 0.9, true));
    this.obj.position.copy(pos);
    this.obj.scale.setScalar(0.1);
  }

  update(dt: number) {
    this.t += dt;
    const k = Math.min(this.t / 0.45, 1);
    this.obj.scale.setScalar(0.1 + this.radius * (1 - (1 - k) ** 2));
    this.obj.material.opacity = 0.9 * (1 - k);
    return k >= 1;
  }
}

/** 小烟团：僵尸化成灰、豌豆命中等 */
export class Puff implements Effect {
  obj: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private t = 0;

  constructor(pos: THREE.Vector3, color: number, private size = 0.6, private life = 0.4) {
    this.obj = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), fade(color, 0.8));
    this.obj.position.copy(pos);
    this.obj.scale.setScalar(size * 0.3);
  }

  update(dt: number) {
    this.t += dt;
    const k = Math.min(this.t / this.life, 1);
    this.obj.scale.setScalar(this.size * (0.3 + 0.7 * k));
    this.obj.position.y += dt * 0.6;
    this.obj.material.opacity = 0.8 * (1 - k);
    return k >= 1;
  }
}

/** 从头上掉下来的铁桶 */
export class FallingObject implements Effect {
  private t = 0;
  private landed = false;
  private vel: THREE.Vector3;
  private spin: THREE.Vector3;

  constructor(public obj: THREE.Object3D) {
    this.vel = new THREE.Vector3((Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2);
    this.spin = new THREE.Vector3(Math.random() * 6, Math.random() * 4, Math.random() * 6);
  }

  update(dt: number) {
    this.t += dt;
    if (!this.landed) {
      this.vel.y -= 12 * dt;
      this.obj.position.addScaledVector(this.vel, dt);
      this.obj.rotation.x += this.spin.x * dt;
      this.obj.rotation.y += this.spin.y * dt;
      this.obj.rotation.z += this.spin.z * dt;
      if (this.obj.position.y <= 0.3) {
        this.obj.position.y = 0.3;
        this.landed = true;
      }
    } else if (this.t > 2) {
      this.obj.position.y -= dt * 0.8; // 慢慢沉到地下
    }
    return this.t > 3;
  }
}
