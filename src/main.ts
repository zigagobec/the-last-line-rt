import { botInput, newBot, type BotMemory } from './bot';
import { Hud } from './hud';
import { anyPressed, endFrame, playerInput, wasPressed } from './input';
import { buildAtlas } from './render/atlas';
import { DEFAULT_FIT, OrbitCamera } from './render/camera';
import { initGpu } from './render/gpu';
import { Renderer } from './render/renderer';
import { buildView } from './view';
import { fadeOccluders, type SpriteName } from './view/scene';
import { createWorld, N, step, type Input, type World } from './world';

function fatal(text: string): void {
  const box = document.createElement('div');
  box.className = 'fatal paper';
  box.textContent = text;
  document.body.appendChild(box);
}

type Mode = 'menu' | 'play' | 'end';

async function boot() {
  const canvas = document.getElementById('gfx') as HTMLCanvasElement;
  const gpu = await initGpu(canvas);
  document.getElementById('loading')?.remove();
  if (!gpu) {
    fatal('Ta brskalnik ne podpira WebGPU. Poskusi z novejšim Chromom ali Edgeem.');
    return;
  }
  const renderer = await Renderer.create(gpu, await buildAtlas(gpu.device));
  const aspects: Partial<Record<SpriteName, number>> = {};
  for (const [name, f] of Object.entries(renderer.atlas.frames)) aspects[name as SpriteName] = f.aspect;

  const cam = new OrbitCamera(N);
  const hud = new Hud();
  const score = [0, 0];
  let world: World = createWorld();
  let bots: (BotMemory | null)[] = [newBot(), newBot()];
  let mode: Mode = 'menu';
  let players = 1;
  let endShown = false;

  const startGame = (count: number) => {
    players = count;
    world = createWorld();
    bots = [null, count === 1 ? newBot() : null];
    mode = 'play';
    endShown = false;
    hud.close();
    hud.show(true);
  };
  const toMenu = () => {
    mode = 'menu';
    score[0] = 0;
    score[1] = 0;
    world = createWorld();
    bots = [newBot(), newBot()];
    hud.show(false);
    hud.showStart(startGame);
  };
  toMenu();

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (mode === 'menu') {
      if (wasPressed('Digit1') || wasPressed('Numpad1')) startGame(1);
      else if (wasPressed('Digit2') || wasPressed('Numpad2')) startGame(2);
    } else if (mode === 'end') {
      if (wasPressed('Enter') || wasPressed('Space')) startGame(players);
      else if (wasPressed('Escape')) toMenu();
    } else if (wasPressed('Escape')) toMenu();

    const inputs: Input[] = [0, 1].map((id) => {
      const bot = bots[id];
      return bot ? botInput(world, id, bot, dt) : playerInput(id);
    });
    step(world, dt, inputs);

    if (world.over) {
      if (mode === 'menu') {
        // The demo behind the title screen just keeps playing new matches.
        if (world.time > 0 && !anyPressed()) {
          world = createWorld();
          bots = [newBot(), newBot()];
        }
      } else if (!endShown) {
        endShown = true;
        mode = 'end';
        if (world.winner < 2) score[world.winner] += 1;
        hud.show(false);
        hud.showEnd(world.winner, score, () => startGame(players), toMenu);
      }
    }

    cam.update(dt);
    cam.fit(renderer.aspect, { ...DEFAULT_FIT, top: 0.62, bottom: -0.8 });
    const view = buildView(world, mode === 'play');
    fadeOccluders(view, cam.viewProj(renderer.aspect), cam.view(), cam.eye(), aspects);
    renderer.render(view, cam);
    if (mode === 'play') hud.update(world, score);
    endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  (window as unknown as { __rt: unknown }).__rt = { world: () => world, start: startGame };
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('loading')?.remove();
  fatal('Igre ni bilo mogoče zagnati.');
});
