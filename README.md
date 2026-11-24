# The Last Line — real-time prototype

A quick prototype of a real-time take on The Last Line: two rats run around a board that keeps
falling apart, jump gaps, draw trees and bridges with a pencil and erase them again. Whoever falls loses.
Rendered with raw WebGPU, reusing the doodle renderer of the turn-based prototype.

**Play:** https://zigagobec.github.io/the-last-line-rt/ (needs a WebGPU browser and a keyboard).

| | Blue | Red |
|---|---|---|
| move | `W A S D` | arrow keys |
| jump | `Space` | right `Shift` |
| draw (tree on land, bridge over a gap) | `E` | `Enter` |
| erase | `Q` | `Backspace` |

`1` starts a game against the computer, `2` a two-player game. Gamepads work too.

```bash
npm install
npm run dev
```

- `src/world.ts` — the whole simulation: movement, gravity, collisions, erosion, tools
- `src/bot.ts` — computer opponent
- `src/view.ts`, `src/hud.ts` — scene for the renderer and the HTML HUD
- `src/render/` — WebGPU renderer taken from the turn-based prototype
