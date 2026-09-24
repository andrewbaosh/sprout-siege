export class Hud {
  sun = 0;

  private sunEl = document.getElementById('sun-count')!;
  private remainingEl = document.getElementById('remaining-count')!;
  private heldEl = document.getElementById('held')!;
  private toastEl = document.getElementById('toast')!;
  private toastTimer = 0;
  private lastRemaining = -1;

  setSun(value: number) {
    this.sun = value;
    this.sunEl.textContent = String(value);
  }

  addSun(amount: number) {
    this.setSun(this.sun + amount);
    pop(this.sunEl.parentElement!);
  }

  setRemaining(n: number) {
    if (n === this.lastRemaining) return;
    if (this.lastRemaining !== -1) pop(this.remainingEl.parentElement!);
    this.lastRemaining = n;
    this.remainingEl.textContent = String(n);
  }

  setHeld(name: string | null) {
    this.heldEl.classList.toggle('show', !!name);
    if (name) this.heldEl.innerHTML = `手上：<b>${name}</b>　站在草坪格子上按 <kbd>E</kbd> 种下，按 <kbd>Q</kbd> 放回`;
  }

  toast(text: string, ms = 3000) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}

function pop(el: HTMLElement) {
  el.classList.remove('pop');
  void el.offsetWidth; // 重新触发动画
  el.classList.add('pop');
}
