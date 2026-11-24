import type { Input } from './world';

interface Keys {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  jump: string[];
  draw: string[];
  erase: string[];
}

const BINDINGS: Keys[] = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], jump: ['Space'], draw: ['KeyE'], erase: ['KeyQ'] },
  {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    jump: ['ShiftRight', 'Numpad0'],
    draw: ['Enter', 'Numpad1'],
    erase: ['Backspace', 'Numpad2'],
  },
];

const held = new Set<string>();
const pressed = new Set<string>();
const padHeld: boolean[][] = [[], []];

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!e.repeat) pressed.add(e.code);
  held.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

/** Whether a key went down since the last `endFrame`. */
export const wasPressed = (code: string) => pressed.has(code);
export const anyPressed = () => pressed.size > 0;

export function playerInput(id: number): Input {
  const b = BINDINGS[id];
  const down = (codes: string[]) => codes.some((c) => held.has(c));
  const hit = (codes: string[]) => codes.some((c) => pressed.has(c));
  const input: Input = {
    mx: (down(b.right) ? 1 : 0) - (down(b.left) ? 1 : 0),
    mz: (down(b.down) ? 1 : 0) - (down(b.up) ? 1 : 0),
    jump: hit(b.jump),
    draw: hit(b.draw),
    erase: hit(b.erase),
  };
  const pad = navigator.getGamepads?.()[id];
  if (pad) {
    const dead = (v: number) => (Math.abs(v) < 0.25 ? 0 : v);
    input.mx += dead(pad.axes[0] ?? 0) + ((pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0));
    input.mz += dead(pad.axes[1] ?? 0) + ((pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0));
    const edge = (i: number) => {
      const now = !!pad.buttons[i]?.pressed;
      const was = padHeld[id][i] ?? false;
      padHeld[id][i] = now;
      return now && !was;
    };
    input.jump ||= edge(0);
    input.erase ||= edge(1);
    input.draw ||= edge(2);
  }
  return input;
}

export function endFrame(): void {
  pressed.clear();
}
