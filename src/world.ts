import * as THREE from 'three';

// 布局：小屋在 -x 端，僵尸聚集地（墓地）在 +x 端，中间是 5 行草坪
export const WORLD = {
  lawnMinX: -16,
  lawnMaxX: 16,
  lawnMinZ: -10,
  lawnMaxZ: 10,
  lanes: 5,
  cols: 9,
  houseFrontX: -22,
  doorZ: 0,
  graveMinX: 19,
  graveMaxX: 31,
  shopZ: 14, // 卡槽所在的位置（草坪右侧，篱笆外）
  playerMaxZ: 16.5,
};

export const TILE_W = (WORLD.lawnMaxX - WORLD.lawnMinX) / WORLD.cols;
export const TILE_H = (WORLD.lawnMaxZ - WORLD.lawnMinZ) / WORLD.lanes;

export function laneZ(lane: number) {
  return WORLD.lawnMinZ + (lane + 0.5) * TILE_H;
}

export function tileCenter(col: number, row: number) {
  return { x: WORLD.lawnMinX + (col + 0.5) * TILE_W, z: laneZ(row) };
}

/** 坐标所在的草坪格子，不在草坪上返回 null */
export function tileAt(x: number, z: number): { col: number; row: number } | null {
  const col = Math.floor((x - WORLD.lawnMinX) / TILE_W);
  const row = Math.floor((z - WORLD.lawnMinZ) / TILE_H);
  if (col < 0 || col >= WORLD.cols || row < 0 || row >= WORLD.lanes) return null;
  return { col, row };
}

const std = (color: number, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function buildWorld(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x9fd4ff);
  scene.fog = new THREE.Fog(0x9fd4ff, 40, 110);

  scene.add(new THREE.HemisphereLight(0xd6ecff, 0x3a5a20, 1.1));
  const sunLight = new THREE.DirectionalLight(0xfff2d6, 2.2);
  sunLight.position.set(14, 28, 18);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const sc = sunLight.shadow.camera;
  sc.left = -40;
  sc.right = 40;
  sc.top = 25;
  sc.bottom = -25;
  sc.far = 90;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  const ground = mesh(new THREE.PlaneGeometry(260, 260), std(0x4e8a2f), false);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  buildLawn(scene);
  buildHouse(scene);
  buildFences(scene);
  buildGraveyard(scene);
  buildTrees(scene);
}

function buildLawn(scene: THREE.Scene) {
  const geo = new THREE.PlaneGeometry(TILE_W, TILE_H);
  const light = std(0x6cc24a);
  const dark = std(0x5aae3a);
  for (let r = 0; r < WORLD.lanes; r++) {
    for (let c = 0; c < WORLD.cols; c++) {
      const tile = mesh(geo, (r + c) % 2 ? light : dark, false);
      tile.rotation.x = -Math.PI / 2;
      const { x, z } = tileCenter(c, r);
      tile.position.set(x, 0.01, z);
      scene.add(tile);
    }
  }

  // 草坪到小屋门口的石板路
  const stoneGeo = new THREE.BoxGeometry(0.9, 0.08, 1.6);
  const stoneMat = std(0xb9ae98);
  for (let i = 0; i < 5; i++) {
    const s = mesh(stoneGeo, stoneMat, false);
    s.position.set(WORLD.houseFrontX + 1.6 + i * 1.1, 0.04, WORLD.doorZ);
    scene.add(s);
  }

  // 卡槽所在的小广场
  const plaza = mesh(new THREE.CircleGeometry(1, 40), std(0xcfc3a6), false);
  plaza.rotation.x = -Math.PI / 2;
  plaza.scale.set(10.5, 3, 1);
  plaza.position.set(-11, 0.02, WORLD.shopZ);
  scene.add(plaza);
}

function buildHouse(scene: THREE.Scene) {
  const fx = WORLD.houseFrontX;
  const depth = 8;
  const cx = fx - depth / 2;

  const body = mesh(new THREE.BoxGeometry(depth, 4.5, 12), std(0xf3e6c8));
  body.position.set(cx, 2.25, 0);
  scene.add(body);

  const roofShape = new THREE.Shape();
  roofShape.moveTo(-4.8, 0);
  roofShape.lineTo(4.8, 0);
  roofShape.lineTo(0, 3.4);
  roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 13, bevelEnabled: false });
  const roof = mesh(roofGeo, std(0xb5472f));
  roof.position.set(cx, 4.5, -6.5);
  scene.add(roof);

  const chimney = mesh(new THREE.BoxGeometry(1, 2.5, 1), std(0x8c5a44));
  chimney.position.set(cx - 1.5, 6.6, 3);
  scene.add(chimney);

  // 门洞：黑色的屋内 + 向外敞开的门板，僵尸从这里走进去
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.8), new THREE.MeshBasicMaterial({ color: 0x140d08 }));
  doorway.rotation.y = Math.PI / 2;
  doorway.position.set(fx + 0.01, 1.4, WORLD.doorZ);
  scene.add(doorway);

  const frameMat = std(0x6b4a2e);
  const top = mesh(new THREE.BoxGeometry(0.2, 0.2, 2.2), frameMat);
  top.position.set(fx + 0.05, 2.9, WORLD.doorZ);
  scene.add(top);
  for (const s of [-1, 1]) {
    const side = mesh(new THREE.BoxGeometry(0.2, 2.8, 0.2), frameMat);
    side.position.set(fx + 0.05, 1.4, WORLD.doorZ + s * 1.0);
    scene.add(side);
  }

  const hinge = new THREE.Group();
  hinge.position.set(fx + 0.1, 1.4, WORLD.doorZ - 0.9);
  hinge.rotation.y = 1.2;
  const panel = mesh(new THREE.BoxGeometry(0.08, 2.75, 1.8), std(0x8a5a32));
  panel.position.z = 0.9;
  hinge.add(panel);
  scene.add(hinge);

  const step = mesh(new THREE.BoxGeometry(1.2, 0.2, 3), std(0x9d9486));
  step.position.set(fx + 0.6, 0.1, WORLD.doorZ);
  scene.add(step);

  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd0ea, emissive: 0x2a4a5a, roughness: 0.2 });
  for (const z of [-3.6, 3.6]) {
    const win = mesh(new THREE.BoxGeometry(0.1, 1.4, 1.8), glassMat, false);
    win.position.set(fx + 0.02, 2.6, z);
    scene.add(win);
    const frame = mesh(new THREE.BoxGeometry(0.12, 1.6, 2.0), std(0xffffff));
    frame.position.set(fx - 0.01, 2.6, z);
    scene.add(frame);
  }
}

function buildFences(scene: THREE.Scene) {
  const x0 = WORLD.houseFrontX;
  const x1 = WORLD.graveMinX;
  const spacing = 0.6;
  const count = Math.floor((x1 - x0) / spacing) + 1;
  const postGeo = new THREE.BoxGeometry(0.14, 1.1, 0.14);
  const mat = std(0xf6f1e4);
  const posts = new THREE.InstancedMesh(postGeo, mat, count * 2);
  posts.castShadow = true;
  const m = new THREE.Matrix4();
  let i = 0;
  for (const z of [WORLD.lawnMinZ - 0.6, WORLD.lawnMaxZ + 0.6]) {
    for (let k = 0; k < count; k++) {
      m.makeTranslation(x0 + k * spacing, 0.55, z);
      posts.setMatrixAt(i++, m);
    }
    for (const y of [0.35, 0.8]) {
      const rail = mesh(new THREE.BoxGeometry(x1 - x0, 0.1, 0.06), mat);
      rail.position.set((x0 + x1) / 2, y, z);
      scene.add(rail);
    }
  }
  scene.add(posts);
}

function buildGraveyard(scene: THREE.Scene) {
  const { graveMinX, graveMaxX } = WORLD;
  const soil = mesh(new THREE.PlaneGeometry(graveMaxX - graveMinX + 2, 28), std(0x5a5140), false);
  soil.rotation.x = -Math.PI / 2;
  soil.position.set((graveMinX + graveMaxX) / 2, 0.015, 0);
  scene.add(soil);

  const stoneMat = std(0x8a8f94);
  const slab = new THREE.BoxGeometry(0.25, 1.1, 0.9);
  const cap = new THREE.CylinderGeometry(0.45, 0.45, 0.25, 16);
  cap.rotateZ(Math.PI / 2);
  const rand = mulberry32(7);
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const s = mesh(slab, stoneMat);
    s.position.y = 0.55;
    const c = mesh(cap, stoneMat);
    c.position.y = 1.1;
    g.add(s, c);
    g.position.set(graveMinX + 1.5 + rand() * (graveMaxX - graveMinX - 2), 0, -11 + rand() * 22);
    g.rotation.set(0, (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.3);
    scene.add(g);
  }

  const barkMat = std(0x3b2f2a);
  for (const [x, z] of [[29, -8], [30, 5], [26, 10.5]]) {
    const tree = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.18, 0.3, 4, 6), barkMat);
    trunk.position.y = 2;
    tree.add(trunk);
    for (let b = 0; b < 3; b++) {
      const branch = mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.6, 5), barkMat);
      branch.position.set(0, 2.4 + b * 0.6, 0);
      branch.rotation.set(0, b * 2.1, 0.9);
      branch.translateY(0.7);
      tree.add(branch);
    }
    tree.position.set(x, 0, z);
    scene.add(tree);
  }

  // 墓地后面的铁栅栏
  const barGeo = new THREE.BoxGeometry(0.06, 1.6, 0.06);
  const bars = new THREE.InstancedMesh(barGeo, std(0x2a2a30), 56);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 56; i++) {
    m.makeTranslation(graveMaxX + 1.5, 0.8, -14 + i * 0.5);
    bars.setMatrixAt(i, m);
  }
  scene.add(bars);

  const eerie = new THREE.PointLight(0x9b6bff, 60, 22);
  eerie.position.set((graveMinX + graveMaxX) / 2, 3, 0);
  scene.add(eerie);
}

function buildTrees(scene: THREE.Scene) {
  const leafMat = std(0x2f6b34);
  const trunkMat = std(0x6b4a2e);
  const leafGeo = new THREE.ConeGeometry(2.2, 6, 7);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 2, 6);
  const rand = mulberry32(42);
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const r = 45 + rand() * 30;
    const s = 0.8 + rand() * 0.8;
    const tree = new THREE.Group();
    const trunk = mesh(trunkGeo, trunkMat, false);
    trunk.position.y = 1;
    const leaves = mesh(leafGeo, leafMat, false);
    leaves.position.y = 5;
    tree.add(trunk, leaves);
    tree.scale.setScalar(s);
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    scene.add(tree);
  }
}

// 固定种子的随机数，让场景每次加载都一样
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
