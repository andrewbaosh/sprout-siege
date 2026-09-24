import * as THREE from 'three';
import { WORLD } from './world';
import { PLANT_INFO, buildPlantModel, type PlantKind } from './plants';

const BEAM_HEIGHT = 3.4;
const TRIGGER_RADIUS = 0.7; // 走到光束正中央才算
const CARD_Y = 4.6;

interface Slot {
  kind: PlantKind;
  x: number;
  z: number;
  card: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  model: THREE.Group;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  inside: boolean;
}

const AFFORD = new THREE.Color(0x9dff7a);
const POOR = new THREE.Color(0xff8a6a);

/** 草坪右侧的三个卡槽：走进光束中央就能拿到植物 */
export class Shop {
  private slots: Slot[] = [];
  private time = 0;

  constructor(scene: THREE.Scene) {
    // 面对卡槽时从左到右：机枪射手、毁灭菇、阳光大地
    const kinds: PlantKind[] = ['gatling', 'doom', 'sunland'];
    kinds.forEach((kind, i) => {
      const x = -4 - i * 5;
      const z = WORLD.shopZ;

      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 2.9),
        new THREE.MeshBasicMaterial({ map: makeCardTexture(kind), transparent: true, side: THREE.DoubleSide }),
      );
      card.position.set(x, CARD_Y, z);

      const { root: model } = buildPlantModel(kind);
      model.position.set(x, 1.2, z);
      model.scale.setScalar(0.9);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, BEAM_HEIGHT, 32, 1, true),
        new THREE.MeshBasicMaterial({
          color: AFFORD,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      beam.position.set(x, BEAM_HEIGHT / 2, z);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.85, 40),
        new THREE.MeshBasicMaterial({ color: AFFORD, transparent: true, opacity: 0.8, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.04, z);

      scene.add(card, model, beam, ring);
      this.slots.push({ kind, x, z, card, model, beam, ring, inside: false });
    });
  }

  /**
   * 返回玩家这一帧刚走进的卡槽（没有则 null）。
   * 需要先走出光束再走进去才会再次触发。
   */
  update(dt: number, player: THREE.Vector3, sun: number): PlantKind | null {
    this.time += dt;
    let entered: PlantKind | null = null;

    for (const s of this.slots) {
      const affordable = sun >= PLANT_INFO[s.kind].price;
      const color = affordable ? AFFORD : POOR;
      s.beam.material.color.copy(color);
      s.ring.material.color.copy(color);
      s.card.material.color.setHex(affordable ? 0xffffff : 0x8a8a8a);

      s.card.position.y = CARD_Y + Math.sin(this.time * 1.5 + s.x) * 0.15;
      s.card.lookAt(player.x, s.card.position.y, player.z);
      s.model.rotation.y += dt * 0.8;
      s.beam.material.opacity = 0.18 + Math.sin(this.time * 3 + s.x) * 0.06;

      const inside = Math.hypot(player.x - s.x, player.z - s.z) < TRIGGER_RADIUS;
      if (inside && !s.inside) entered = s.kind;
      s.inside = inside;
    }
    return entered;
  }
}

function makeCardTexture(kind: PlantKind) {
  const info = PLANT_INFO[kind];
  const w = 256;
  const h = 338;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;

  roundRect(g, 6, 6, w - 12, h - 12, 22);
  g.fillStyle = '#fdf6e3';
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = info.color;
  g.stroke();

  roundRect(g, 24, 24, w - 48, 190, 14);
  g.fillStyle = kind === 'doom' ? '#2c2440' : '#bfe6a8';
  g.fill();
  drawIcon(g, kind, w / 2, 122);

  g.fillStyle = '#3a2e1a';
  g.font = 'bold 34px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  g.textAlign = 'center';
  g.fillText(info.name, w / 2, 256);

  // 价格：小太阳 + 数字
  const grad = g.createRadialGradient(92, 294, 2, 92, 294, 16);
  grad.addColorStop(0, '#fff6b0');
  grad.addColorStop(1, '#ffb300');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(92, 294, 16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3a2e1a';
  g.font = 'bold 32px -apple-system, sans-serif';
  g.textAlign = 'left';
  g.fillText(String(info.price), 118, 306);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function drawIcon(g: CanvasRenderingContext2D, kind: PlantKind, cx: number, cy: number) {
  const circle = (x: number, y: number, r: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };

  if (kind === 'gatling') {
    g.fillStyle = '#3f9a2a';
    g.fillRect(cx - 6, cy + 20, 12, 60);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#4a9e2c';
      g.fillRect(cx + 30, cy - 28 + i * 13, 52, 11);
    }
    circle(cx, cy, 48, '#6cd13f');
    g.fillStyle = '#2f6d1f';
    g.beginPath();
    g.arc(cx, cy - 4, 52, Math.PI, 0);
    g.fill();
    circle(cx + 14, cy + 4, 11, '#fff');
    circle(cx + 18, cy + 4, 6, '#111');
  } else if (kind === 'doom') {
    g.fillStyle = '#4a3a6a';
    g.fillRect(cx - 28, cy + 5, 56, 60);
    g.fillStyle = '#5b3a8a';
    g.beginPath();
    g.ellipse(cx, cy + 8, 78, 70, 0, Math.PI, 0);
    g.fill();
    for (const [dx, dy] of [[-40, -18], [0, -45], [38, -20], [-15, -5], [22, -2]]) circle(cx + dx, cy + dy, 9, '#c9a6ff');
    circle(cx - 12, cy + 30, 7, '#fff');
    circle(cx + 12, cy + 30, 7, '#fff');
  } else {
    // 背后的黑洞
    g.save();
    g.translate(cx - 36, cy - 30);
    g.scale(1, 0.45);
    g.strokeStyle = '#b070ff';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(0, 0, 44, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    circle(cx - 36, cy - 30, 26, '#000');
    // 全黄的玉米
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.ellipse(cx + 8, cy + 10, 34, 58, 0, 0, Math.PI * 2);
    g.fill();
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) circle(cx - 8 + c * 16, cy - 25 + r * 17, 5, '#ffe680');
    circle(cx + 2, cy - 2, 7, '#fff');
    circle(cx + 22, cy - 2, 7, '#fff');
    circle(cx + 4, cy - 2, 3.5, '#111');
    circle(cx + 24, cy - 2, 3.5, '#111');
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
