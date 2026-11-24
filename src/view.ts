import { tileCenter } from './render/camera';
import type { Vec4 } from './render/math';
import { PLAYER_TINT } from './view/colors';
import { NO_TINT, RAT_HEIGHT, SIGN_HEIGHT, sprite, TILE_HIGHLIGHT, TILE_MARKED, TREE_HEIGHT, type SceneView } from './view/scene';
import { canBridge, cellAt, inBounds, N, targetCell, type World } from './world';

/** Picture of the world for the renderer, rebuilt every frame. */
export function buildView(w: World, showTargets: boolean): SceneView {
  const view: SceneView = { size: N, seed: 1, tiles: [], bridges: [], sprites: [], time: w.time };
  const urgency = w.phase === 'warn' ? 1 - w.phaseLeft / w.phaseTotal : 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = cellAt(w, x, y);
      const p = { x, y };
      const center = tileCenter(N, p);
      if (c.land || c.falling) {
        view.tiles.push({
          x,
          y,
          drop: c.drop,
          flags: c.marked ? TILE_MARKED : 0,
          tint: NO_TINT,
          decal: c.seed < 0.55 ? Math.floor(c.seed * 7.27) % 4 : -1,
          seed: c.seed,
        });
      }
      if (c.land && c.tree) {
        const tree = sprite(`tree:${x},${y}`, 'tree', center, TREE_HEIGHT, c.seed < 0.5);
        tree.reveal = Math.min(1, c.treeAge / 0.3);
        view.sprites.push(tree);
      }
      if (c.land && c.marked) {
        const wobble = Math.sin(w.time * (8 + urgency * 22) + x * 3 + y) * 0.03 * (0.4 + urgency);
        view.sprites.push(sprite(`sign:${x},${y}`, 'sign', [center[0] + 0.28 + wobble, 0, center[2] - 0.28], SIGN_HEIGHT * (1 + urgency * 0.25), false));
      }
      if (c.bridge) {
        // A fading drawing: the plank flickers before it disappears.
        const fading = c.bridgeLeft < 2.5 && Math.floor(w.time * 9) % 2 === 0;
        view.bridges.push({ x, y, dir: c.bridge, ghost: fading, tint: fading ? [0.4, 0.4, 0.4, 1] : NO_TINT, drop: 0 });
      }
    }
  }
  for (const r of w.rats) {
    if (!r.alive) continue;
    const hop = r.onGround ? Math.abs(Math.sin(r.walk)) * 0.07 : 0;
    const s = sprite(`rat${r.id}`, r.id === 0 ? 'rat0' : 'rat1', [r.x - (N - 1) / 2, r.y + hop, r.z - (N - 1) / 2], RAT_HEIGHT, r.flip);
    view.sprites.push(s);
    if (!showTargets || !r.onGround) continue;
    const t = targetCell(r);
    if (!inBounds(t.x, t.y)) continue;
    const tint: Vec4 = PLAYER_TINT[r.id as 0 | 1];
    const tile = view.tiles.find((v) => v.x === t.x && v.y === t.y && v.drop === 0);
    if (tile) {
      tile.flags |= TILE_HIGHLIGHT;
      tile.tint = tint;
    } else if (r.ink >= 1 && canBridge(w, t.x, t.y, r.fx !== 0 ? 'H' : 'V')) {
      view.bridges.push({ x: t.x, y: t.y, dir: r.fx !== 0 ? 'H' : 'V', ghost: true, tint: [tint[0], tint[1], tint[2], 1], drop: 0.02 });
    }
  }
  for (const p of w.poofs) {
    const s = sprite(`poof:${p.x},${p.z},${p.y}`, 'poof', [p.x - (N - 1) / 2, p.y - 0.25 + p.age * 0.6, p.z - (N - 1) / 2], 0.7 + p.age * 1.2, false);
    s.alpha = 1 - p.age / 0.45;
    view.sprites.push(s);
  }
  return view;
}
