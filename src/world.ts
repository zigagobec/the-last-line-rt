import type { BridgeDir } from './game';

export const N = 8;
export const MAX_INK = 3;
const SPEED = 3.4;
const ACCEL = 30;
const AIR_ACCEL = 12;
const GRAVITY = 22;
const JUMP = 5.6;
/** Rat half-width for collisions. */
export const R = 0.2;
/** Half-width of the footprint that must overlap a tile for the rat to stand on it. */
const SUPPORT = 0.13;
const TREE_R = 0.3;
const INK_REGEN = 1 / 3;
const ERASE_COOLDOWN = 0.9;
const BRIDGE_LIFE = 9;
const KILL_Y = -7;

export interface Cell {
  land: boolean;
  tree: boolean;
  /** Seconds since the tree was drawn (drives the sketch-in animation). */
  treeAge: number;
  bridge: BridgeDir | null;
  bridgeLeft: number;
  marked: boolean;
  falling: boolean;
  drop: number;
  dropV: number;
  seed: number;
}

export interface Rat {
  id: number;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  onGround: boolean;
  coyote: number;
  fx: number;
  fz: number;
  flip: boolean;
  ink: number;
  eraseCd: number;
  alive: boolean;
  walk: number;
}

export interface Input {
  mx: number;
  mz: number;
  jump: boolean;
  draw: boolean;
  erase: boolean;
}

export const NO_INPUT: Input = { mx: 0, mz: 0, jump: false, draw: false, erase: false };

export interface Poof {
  x: number;
  y: number;
  z: number;
  age: number;
}

export interface World {
  cells: Cell[];
  rats: Rat[];
  poofs: Poof[];
  time: number;
  round: number;
  phase: 'calm' | 'warn';
  phaseLeft: number;
  phaseTotal: number;
  /** Seconds since the first rat fell; the result is fixed shortly after so a double fall is a draw. */
  endTimer: number;
  over: boolean;
  /** -1 running, 0 blue, 1 red, 2 draw. */
  winner: number;
}

export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;
export const cellAt = (w: World, x: number, y: number) => w.cells[y * N + x];
/** A cell a rat can stand on. */
export const isFloor = (w: World, x: number, y: number) => {
  if (!inBounds(x, y)) return false;
  const c = cellAt(w, x, y);
  return (c.land && !c.falling) || c.bridge !== null;
};
export const isWalkable = (w: World, x: number, y: number) => isFloor(w, x, y) && !cellAt(w, x, y).tree;

function newRat(id: number, x: number, z: number): Rat {
  return { id, x, z, y: 0, vx: 0, vz: 0, vy: 0, onGround: true, coyote: 0, fx: id === 0 ? 1 : -1, fz: 0, flip: id === 1, ink: MAX_INK, eraseCd: 0, alive: true, walk: 0 };
}

export function createWorld(): World {
  const cells: Cell[] = [];
  for (let i = 0; i < N * N; i++) {
    cells.push({ land: true, tree: false, treeAge: 9, bridge: null, bridgeLeft: 0, marked: false, falling: false, drop: 0, dropV: 0, seed: Math.random() });
  }
  const w: World = {
    cells,
    rats: [newRat(0, 1, 3), newRat(1, 6, 4)],
    poofs: [],
    time: 0,
    round: 1,
    phase: 'calm',
    phaseLeft: 2.5,
    phaseTotal: 2.5,
    endTimer: -1,
    over: false,
    winner: -1,
  };
  // Mirror-symmetric trees and gaps, clear of both starting corners.
  const nearSpawn = (x: number, y: number) => Math.abs(x - 1) + Math.abs(y - 3) <= 2 || Math.abs(x - 6) + Math.abs(y - 4) <= 2;
  const place = (count: number, apply: (c: Cell) => void) => {
    let placed = 0;
    for (let tries = 0; tries < 200 && placed < count; tries++) {
      const x = Math.floor(Math.random() * N);
      const y = Math.floor(Math.random() * (N / 2));
      const a = cellAt(w, x, y);
      const b = cellAt(w, N - 1 - x, N - 1 - y);
      if (nearSpawn(x, y) || !a.land || a.tree) continue;
      apply(a);
      apply(b);
      placed++;
    }
  };
  place(2, (c) => (c.tree = true));
  place(2, (c) => (c.land = false));
  return w;
}

/** The tile a rat's pencil or eraser acts on: the one in front of it. */
export function targetCell(r: Rat): { x: number; y: number } {
  return { x: Math.round(r.x + r.fx * 0.85), y: Math.round(r.z + r.fz * 0.85) };
}

function approach(v: number, goal: number, step: number): number {
  return v < goal ? Math.min(goal, v + step) : Math.max(goal, v - step);
}

/** Push the rat out of an axis-aligned box along the shallower axis. */
function pushOut(r: Rat, cx: number, cz: number, half: number): void {
  const dx = r.x - cx;
  const dz = r.z - cz;
  const ox = half + R - Math.abs(dx);
  const oz = half + R - Math.abs(dz);
  if (ox <= 0 || oz <= 0) return;
  if (ox < oz) {
    const s = dx < 0 ? -1 : 1;
    r.x += s * ox;
    if (r.vx * s < 0) r.vx = 0;
  } else {
    const s = dz < 0 ? -1 : 1;
    r.z += s * oz;
    if (r.vz * s < 0) r.vz = 0;
  }
}

function hasSupport(w: World, r: Rat): boolean {
  for (let cy = Math.round(r.z - SUPPORT); cy <= Math.round(r.z + SUPPORT); cy++) {
    for (let cx = Math.round(r.x - SUPPORT); cx <= Math.round(r.x + SUPPORT); cx++) {
      if (isFloor(w, cx, cy)) return true;
    }
  }
  return false;
}

function ratOverlapsCell(w: World, x: number, y: number, half: number): boolean {
  return w.rats.some((r) => r.alive && r.y > -0.6 && Math.abs(r.x - x) < half + R && Math.abs(r.z - y) < half + R);
}

/** A bridge spans one gap and must rest on solid land at one end at least, so bridges cannot be chained. */
export function canBridge(w: World, x: number, y: number, dir: BridgeDir): boolean {
  if (!inBounds(x, y)) return false;
  const c = cellAt(w, x, y);
  if (c.land || c.bridge || c.falling) return false;
  const solid = (cx: number, cy: number) => inBounds(cx, cy) && cellAt(w, cx, cy).land && !cellAt(w, cx, cy).falling;
  return dir === 'H' ? solid(x - 1, y) || solid(x + 1, y) : solid(x, y - 1) || solid(x, y + 1);
}

function poof(w: World, x: number, y: number, h = 0.5): void {
  w.poofs.push({ x, y: h, z: y, age: 0 });
}

function useTools(w: World, r: Rat, input: Input): void {
  if (!r.onGround) return;
  const t = targetCell(r);
  if (!inBounds(t.x, t.y)) return;
  const c = cellAt(w, t.x, t.y);
  if (input.erase && r.eraseCd <= 0) {
    if (c.tree) {
      c.tree = false;
      r.eraseCd = ERASE_COOLDOWN;
      poof(w, t.x, t.y, 0.6);
    } else if (c.bridge) {
      c.bridge = null;
      r.eraseCd = ERASE_COOLDOWN;
      poof(w, t.x, t.y, 0.1);
    }
  }
  if (input.draw && r.ink >= 1) {
    if (c.land && !c.falling && !c.tree && !ratOverlapsCell(w, t.x, t.y, TREE_R)) {
      c.tree = true;
      c.treeAge = 0;
      r.ink -= 1;
    } else if (canBridge(w, t.x, t.y, r.fx !== 0 ? 'H' : 'V')) {
      c.bridge = r.fx !== 0 ? 'H' : 'V';
      c.bridgeLeft = BRIDGE_LIFE;
      r.ink -= 1;
    }
  }
}

function stepRat(w: World, r: Rat, input: Input, dt: number): void {
  if (!r.alive) return;
  let mx = input.mx;
  let mz = input.mz;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  if (len > 0.3) {
    if (Math.abs(mx) >= Math.abs(mz)) {
      r.fx = mx < 0 ? -1 : 1;
      r.fz = 0;
    } else {
      r.fx = 0;
      r.fz = mz < 0 ? -1 : 1;
    }
    if (Math.abs(mx) > 0.3) r.flip = mx < 0;
  }
  const accel = (r.onGround ? ACCEL : AIR_ACCEL) * dt;
  r.vx = approach(r.vx, mx * SPEED, accel);
  r.vz = approach(r.vz, mz * SPEED, accel);
  r.ink = Math.min(MAX_INK, r.ink + INK_REGEN * dt);
  r.eraseCd -= dt;

  if (input.jump && (r.onGround || r.coyote > 0)) {
    r.vy = JUMP;
    r.onGround = false;
    r.coyote = 0;
  }
  useTools(w, r, input);

  r.x += r.vx * dt;
  r.z += r.vz * dt;
  r.vy -= GRAVITY * dt;
  r.y += r.vy * dt;

  const cx = Math.round(r.x);
  const cz = Math.round(r.z);
  for (let y = cz - 1; y <= cz + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (!inBounds(x, y)) continue;
      if (cellAt(w, x, y).tree && r.y > -0.5) pushOut(r, x, y, TREE_R);
    }
  }

  if (r.vy <= 0 && r.y <= 0 && r.y > -0.2 && hasSupport(w, r)) {
    r.y = 0;
    r.vy = 0;
    r.onGround = true;
    r.coyote = 0.09;
  } else {
    r.onGround = false;
    r.coyote -= dt;
  }

  // Below the surface the tile walls are solid, so a short jump slides down the side.
  if (r.y < -0.03 && r.y > -0.6) {
    for (let y = cz - 1; y <= cz + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (!inBounds(x, y)) continue;
        const c = cellAt(w, x, y);
        if (c.land && !c.falling) pushOut(r, x, y, 0.5);
      }
    }
  }

  r.walk = r.onGround && Math.hypot(r.vx, r.vz) > 0.4 ? r.walk + dt * 11 : 0;
  if (r.y < KILL_Y) r.alive = false;
}

/** Rats shove each other: overlapping rats are separated equally, so walking into the other pushes it. */
function separateRats(w: World): void {
  const [a, b] = w.rats;
  if (!a.alive || !b.alive || Math.abs(a.y - b.y) > 0.7) return;
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const ox = 2 * R - Math.abs(dx);
  const oz = 2 * R - Math.abs(dz);
  if (ox <= 0 || oz <= 0) return;
  if (ox < oz) {
    const s = dx < 0 ? -1 : 1;
    a.x += (s * ox) / 2;
    b.x -= (s * ox) / 2;
  } else {
    const s = dz < 0 ? -1 : 1;
    a.z += (s * oz) / 2;
    b.z -= (s * oz) / 2;
  }
}

/** Land tiles touching the outside: the board edge or a gap connected to it. */
export function edgeCells(w: World): number[] {
  const outside = new Array<boolean>(N * N).fill(false);
  const stack: number[] = [];
  const visit = (x: number, y: number) => {
    if (!inBounds(x, y)) return;
    const i = y * N + x;
    if (w.cells[i].land || outside[i]) return;
    outside[i] = true;
    stack.push(i);
  };
  for (let i = 0; i < N; i++) {
    visit(i, 0);
    visit(i, N - 1);
    visit(0, i);
    visit(N - 1, i);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % N;
    const y = Math.floor(i / N);
    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }
  const out: number[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!w.cells[y * N + x].land) continue;
      const open = (nx: number, ny: number) => !inBounds(nx, ny) || outside[ny * N + nx];
      if (open(x + 1, y) || open(x - 1, y) || open(x, y + 1) || open(x, y - 1)) out.push(y * N + x);
    }
  }
  return out;
}

function takeRandom(pool: number[], count: number): number[] {
  const out: number[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

function markRound(w: World): void {
  const edgeCount = Math.min(5, 2 + Math.floor((w.round - 1) / 4));
  const edge = takeRandom(edgeCells(w), edgeCount);
  const rest: number[] = [];
  w.cells.forEach((c, i) => {
    if (c.land && !edge.includes(i)) rest.push(i);
  });
  for (const i of [...edge, ...takeRandom(rest, 1 + edgeCount - edge.length)]) w.cells[i].marked = true;
}

function erode(w: World): void {
  w.cells.forEach((c, i) => {
    if (!c.marked) return;
    c.marked = false;
    const x = i % N;
    const y = Math.floor(i / N);
    if (c.tree) {
      // A tree shields its tile once: the tree goes, the tile stays.
      c.tree = false;
      poof(w, x, y, 0.6);
      return;
    }
    c.land = false;
    c.falling = true;
    c.dropV = 0;
  });
}

function stepErosion(w: World, dt: number): void {
  w.phaseLeft -= dt;
  if (w.phaseLeft > 0) return;
  if (w.phase === 'calm') {
    markRound(w);
    w.phase = 'warn';
    w.phaseTotal = Math.max(2, 4.4 - w.round * 0.18);
  } else {
    erode(w);
    w.round += 1;
    w.phase = 'calm';
    w.phaseTotal = 0.8;
  }
  w.phaseLeft = w.phaseTotal;
}

function stepCells(w: World, dt: number): void {
  w.cells.forEach((c, i) => {
    c.treeAge += dt;
    if (c.falling) {
      c.dropV += GRAVITY * dt;
      c.drop -= c.dropV * dt;
      if (c.drop < -10) c.falling = false;
    }
    if (c.bridge) {
      c.bridgeLeft -= dt;
      const x = i % N;
      const y = Math.floor(i / N);
      const solid = (cx: number, cy: number) => inBounds(cx, cy) && cellAt(w, cx, cy).land;
      const held = c.bridge === 'H' ? solid(x - 1, y) || solid(x + 1, y) : solid(x, y - 1) || solid(x, y + 1);
      if (c.bridgeLeft <= 0 || !held) {
        c.bridge = null;
        poof(w, i % N, Math.floor(i / N), 0.1);
      }
    }
  });
  for (const p of w.poofs) p.age += dt;
  w.poofs = w.poofs.filter((p) => p.age < 0.45);
}

const SUBSTEP = 1 / 120;

export function step(w: World, dt: number, inputs: Input[]): void {
  let left = Math.min(dt, 0.1);
  let first = true;
  while (left > 1e-6) {
    const h = Math.min(SUBSTEP, left);
    left -= h;
    w.time += h;
    w.rats.forEach((r, i) => {
      // Button presses are edges: only the first substep of a frame sees them.
      const input = first ? inputs[i] : { ...inputs[i], jump: false, draw: false, erase: false };
      stepRat(w, r, w.over ? NO_INPUT : input, h);
    });
    separateRats(w);
    stepCells(w, h);
    if (!w.over) {
      if (w.endTimer < 0) stepErosion(w, h);
      const dead = w.rats.filter((r) => !r.alive);
      if (dead.length && w.endTimer < 0) w.endTimer = 0;
      if (w.endTimer >= 0) {
        w.endTimer += h;
        // A rat already in free fall counts as fallen, so two near-simultaneous falls are a draw.
        const lost = w.rats.filter((r) => !r.alive || r.y < -3.5);
        if (w.endTimer > 0.8) {
          w.over = true;
          w.winner = lost.length === 2 ? 2 : 1 - lost[0].id;
        }
      }
    }
    first = false;
  }
}
