import './style.css';
import * as THREE from 'three';
import { buildWorld } from './world';
import { Player } from './player';
import { Game } from './game';
import { Hud } from './hud';
import { initAudio } from './audio';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 250);

buildWorld(scene);
const hud = new Hud();
const player = new Player(camera, renderer.domElement);
const game = new Game(scene, hud, showResult);

const overlay = document.getElementById('overlay')!;
const overlayTitle = document.getElementById('overlay-title')!;
const overlayBody = document.getElementById('overlay-body')!;
const startBtn = document.getElementById('start')!;
let started = false;

overlay.addEventListener('click', () => {
  if (game.state !== 'playing') {
    location.reload();
    return;
  }
  initAudio();
  // 刚按 Esc 退出后浏览器会短暂拒绝再次锁定鼠标，忽略即可
  Promise.resolve(player.controls.lock()).catch(() => {});
});

player.controls.addEventListener('lock', () => {
  overlay.classList.add('hidden');
  if (!started) {
    started = true;
    hud.toast('先去捡阳光，再到草坪右边的卡槽光束里买植物', 5000);
  }
});

player.controls.addEventListener('unlock', () => {
  overlay.classList.remove('hidden');
  if (game.state === 'playing') startBtn.textContent = '已暂停，点击继续';
});

addEventListener('keydown', (e) => {
  if (!player.isLocked && !debug.forcePlay) return;
  if (e.code === 'KeyE') game.tryPlant(player.position);
  if (e.code === 'KeyQ') game.returnHeld();
});

function showResult(won: boolean) {
  overlayTitle.textContent = won ? '第一波守住了！' : '僵尸进屋了……';
  overlayBody.innerHTML = won
    ? `<p class="result">所有僵尸都被消灭了。<br />剩余阳光 ${hud.sun}</p>`
    : `<p class="result">有一只僵尸走进了小屋。<br />再试一次吧！</p>`;
  startBtn.textContent = '再玩一次';
  if (player.isLocked) player.controls.unlock();
  else overlay.classList.remove('hidden');
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 开发调试用：在控制台里设置 __sprout.forcePlay = true 可以不锁鼠标直接运行
const debug = { forcePlay: false, camera, hud, game };
if (import.meta.env.DEV) Object.assign(window, { __sprout: debug });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const playing = player.isLocked || debug.forcePlay;
  if (playing && game.state === 'playing') player.update(dt);
  game.update(dt, playing, player.position);
  renderer.render(scene, camera);
});
