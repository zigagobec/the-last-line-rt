import { PLAYER_CSS } from './view/colors';
import { MAX_INK, type World } from './world';

const NAMES = ['Modra', 'Rdeča'];

function el(tag: string, cls: string, parent: HTMLElement, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  parent.appendChild(e);
  return e;
}

export class Hud {
  private root = el('div', 'rt-hud', document.body);
  private ink: HTMLElement[][] = [];
  private wins: HTMLElement[] = [];
  private bar: HTMLElement;
  private label: HTMLElement;
  private overlay = el('div', 'menu-layer', document.body);
  private card = el('div', 'card paper', this.overlay);

  constructor() {
    const top = el('div', 'rt-top', this.root);
    const panel = (id: number) => {
      const p = el('div', 'rt-panel paper', top);
      p.style.setProperty('--pc', PLAYER_CSS[id]);
      el('div', 'rt-name', p, `${NAMES[id]} podgana`);
      const row = el('div', 'rt-ink', p);
      el('span', 'rt-inklabel', row, 'črnilo');
      this.ink[id] = [];
      for (let i = 0; i < MAX_INK; i++) this.ink[id].push(el('i', '', row));
      this.wins[id] = el('div', 'rt-wins', p, 'zmage: 0');
    };
    panel(0);
    const mid = el('div', 'rt-mid paper', top);
    this.label = el('div', 'rt-label', mid, '');
    this.bar = el('div', 'rt-bar', el('div', 'rt-track', mid));
    panel(1);
    const keys = el('div', 'rt-keys', this.root);
    keys.innerHTML =
      '<span><b style="color:#2d6cdf">Modra</b> WASD · skok Preslednica · riši E · radiraj Q</span>' +
      '<span><b style="color:#e0442e">Rdeča</b> puščice · skok desni Shift · riši Enter · radiraj Backspace</span>';
  }

  update(w: World, score: number[]): void {
    w.rats.forEach((r, id) => {
      this.ink[id].forEach((pip, i) => pip.classList.toggle('full', r.ink >= i + 1));
      this.wins[id].textContent = `zmage: ${score[id]}`;
    });
    const warn = w.phase === 'warn';
    this.label.textContent = warn ? `Krog ${w.round}: označena polja padajo!` : `Krog ${w.round}`;
    this.bar.style.width = `${warn ? Math.max(0, (w.phaseLeft / w.phaseTotal) * 100) : 100}%`;
    this.bar.classList.toggle('warn', warn);
  }

  show(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  private open(html: string): void {
    this.card.innerHTML = html;
    this.overlay.classList.add('open');
  }

  close(): void {
    this.overlay.classList.remove('open');
  }

  showStart(onPick: (players: number) => void): void {
    this.open(
      '<h1 class="title">The Last Line</h1>' +
        '<p class="tagline">Različica v realnem času: plošča izginja, podgani tečeta.</p>' +
        '<p>Hodi, skači čez vrzeli, riši drevesa in mostove, radiraj tuje. Kdor pade, izgubi.</p>' +
        '<div class="rt-help">' +
        '<p><b style="color:#2d6cdf">Modra</b>: WASD, skok Preslednica, riši E, radiraj Q</p>' +
        '<p><b style="color:#e0442e">Rdeča</b>: puščice, skok desni Shift, riši Enter, radiraj Backspace</p>' +
        '<p class="note">Rišeš in radiraš na polju pred sabo. Drevo zapre pot in enkrat zaščiti polje. Most čez vrzel zbledi po nekaj sekundah. Podgani se lahko odrivata.</p>' +
        '</div>' +
        '<div class="buttons column"><button class="btn paper primary" data-n="1">1 igralec proti računalniku (tipka 1)</button>' +
        '<button class="btn paper" data-n="2">2 igralca (tipka 2)</button></div>',
    );
    this.card.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => onPick(Number((b as HTMLElement).dataset.n))));
  }

  showEnd(winner: number, score: number[], onAgain: () => void, onMenu: () => void): void {
    const title = winner === 2 ? 'Neodločeno!' : `Zmagala je ${NAMES[winner].toLowerCase()} podgana!`;
    const color = winner === 2 ? 'inherit' : PLAYER_CSS[winner];
    this.open(
      `<h2 style="color:${color}">${title}</h2>` +
        `<p>Modra ${score[0]} : ${score[1]} Rdeča</p>` +
        '<div class="buttons"><button class="btn paper primary" data-a="again">Še enkrat (Enter)</button>' +
        '<button class="btn paper" data-a="menu">Meni (Esc)</button></div>',
    );
    this.card.querySelector('[data-a="again"]')!.addEventListener('click', onAgain);
    this.card.querySelector('[data-a="menu"]')!.addEventListener('click', onMenu);
  }
}
