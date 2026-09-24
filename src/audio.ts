let ctx: AudioContext | null = null;

// 必须在用户点击后调用，浏览器才允许播放声音
export function initAudio() {
  if (!ctx) ctx = new AudioContext();
  else void ctx.resume();
}

export function playCollect() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const start = t + i * 0.07;
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  });
}
