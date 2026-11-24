import { cellAt, inBounds, isFloor, isWalkable, N, targetCell, type Input, type World } from './world';

export interface BotMemory {
  thinkIn: number;
  path: { x: number; y: number; jump: boolean }[];
  actIn: number;
  /** Seconds into a warning before this bot notices the marked tiles; re-rolled every round. */
  react: number;
  round: number;
  aware: boolean;
}

export const newBot = (): BotMemory => ({ thinkIn: 0, path: [], actIn: 1.5, react: 1, round: 0, aware: false });

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function danger(w: World, x: number, y: number, aware = true): boolean {
  const c = cellAt(w, x, y);
  return (c.marked && aware) || (c.bridge !== null && !c.land && c.bridgeLeft < 2.5);
}

interface Node {
  x: number;
  y: number;
  dist: number;
  prev: number;
  jump: boolean;
}

function search(w: World, sx: number, sy: number): Node[] {
  const seen = new Map<number, number>();
  const nodes: Node[] = [{ x: sx, y: sy, dist: 0, prev: -1, jump: false }];
  seen.set(sy * N + sx, 0);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    for (const [dx, dy] of DIRS) {
      let x = n.x + dx;
      let y = n.y + dy;
      let jump = false;
      if (!isWalkable(w, x, y)) {
        // A single missing tile can be jumped.
        if (inBounds(x, y) && cellAt(w, x, y).tree) continue;
        if (isFloor(w, x, y)) continue;
        x += dx;
        y += dy;
        jump = true;
        if (!isWalkable(w, x, y)) continue;
      }
      const key = y * N + x;
      if (seen.has(key)) continue;
      seen.set(key, nodes.length);
      nodes.push({ x, y, dist: n.dist + (jump ? 2.5 : 1), prev: i, jump });
    }
  }
  return nodes;
}

function plan(w: World, id: number, mem: BotMemory): void {
  const me = w.rats[id];
  const foe = w.rats[1 - id];
  const sx = Math.round(me.x);
  const sy = Math.round(me.z);
  mem.path = [];
  if (!isFloor(w, sx, sy)) return;
  let cxSum = 0;
  let cySum = 0;
  let count = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (cellAt(w, x, y).land) {
        cxSum += x;
        cySum += y;
        count++;
      }
    }
  }
  const mx = count ? cxSum / count : 3.5;
  const my = count ? cySum / count : 3.5;
  const nodes = search(w, sx, sy);
  let best = 0;
  let bestScore = -Infinity;
  nodes.forEach((n, i) => {
    let exits = 0;
    for (const [dx, dy] of DIRS) if (isWalkable(w, n.x + dx, n.y + dy) && !danger(w, n.x + dx, n.y + dy, mem.aware)) exits++;
    let score = exits * 0.6 - n.dist * 0.18 - Math.hypot(n.x - mx, n.y - my) * 0.25;
    if (danger(w, n.x, n.y, mem.aware)) score -= 10;
    if (Math.abs(n.x - foe.x) + Math.abs(n.y - foe.z) < 1.2) score -= 1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  for (let i = best; nodes[i].prev >= 0; i = nodes[i].prev) mem.path.unshift({ x: nodes[i].x, y: nodes[i].y, jump: nodes[i].jump });
}

export function botInput(w: World, id: number, mem: BotMemory, dt: number): Input {
  const me = w.rats[id];
  const foe = w.rats[1 - id];
  const input: Input = { mx: 0, mz: 0, jump: false, draw: false, erase: false };
  if (!me.alive || w.over) return input;

  if (mem.round !== w.round) {
    mem.round = w.round;
    mem.react = 0.4 + Math.random() * 2.1;
  }
  mem.aware = w.phase === 'warn' && w.phaseTotal - w.phaseLeft > mem.react;
  mem.thinkIn -= dt;
  if (mem.thinkIn <= 0 && me.onGround) {
    plan(w, id, mem);
    mem.thinkIn = 0.25;
  }
  while (mem.path.length && Math.abs(me.x - mem.path[0].x) < 0.14 && Math.abs(me.z - mem.path[0].y) < 0.14) mem.path.shift();

  const next = mem.path[0];
  if (next) {
    const dx = next.x - me.x;
    const dz = next.y - me.z;
    const len = Math.hypot(dx, dz) || 1;
    input.mx = dx / len;
    input.mz = dz / len;
    if (next.jump && me.onGround) {
      // Run up along the jump axis and take off near the edge of the current tile.
      const along = Math.abs(dx) > Math.abs(dz) ? me.x - Math.round(me.x) : me.z - Math.round(me.z);
      const sign = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : Math.sign(dz);
      const speed = Math.hypot(me.vx, me.vz);
      if (along * sign > 0.28 && speed > 2.8) input.jump = true;
    }
  } else {
    const dx = Math.round(me.x) - me.x;
    const dz = Math.round(me.z) - me.z;
    if (Math.hypot(dx, dz) > 0.12) {
      input.mx = dx * 4;
      input.mz = dz * 4;
    }
  }

  mem.actIn -= dt;
  if (mem.actIn <= 0 && me.onGround) {
    mem.actIn = 0.5 + Math.random() * 0.9;
    const t = targetCell(me);
    if (inBounds(t.x, t.y)) {
      const c = cellAt(w, t.x, t.y);
      const here = { x: Math.round(me.x), y: Math.round(me.z) };
      const trapped = danger(w, here.x, here.y, mem.aware) && !mem.path.length;
      if (trapped && c.tree) input.erase = true;
      else if (trapped && !c.land && !c.bridge && me.ink >= 1) input.draw = true;
      else if (me.ink >= 2 && c.land && !c.tree) {
        // Wall the other rat in when it stands just beyond the tile in front.
        const fx = Math.round(foe.x);
        const fy = Math.round(foe.z);
        const beyond = fx === t.x + me.fx && fy === t.y + me.fz;
        const foeInDanger = inBounds(fx, fy) && danger(w, fx, fy);
        if (beyond && (foeInDanger || Math.random() < 0.35)) input.draw = true;
      }
    }
  }
  return input;
}
