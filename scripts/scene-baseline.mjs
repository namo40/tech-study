#!/usr/bin/env node
/**
 * Scene regression baseline.
 *
 * Renders every scene timeline outside a browser and writes down what it looks
 * like, frame by frame, so a refactor can be checked against the exact pixels
 * of state it started from. Nothing here is a unit test of intent: it is a
 * fingerprint. If a snapshot and a run disagree, the run changed behaviour.
 *
 * How it runs TypeScript: the scenes are `.ts`, so each one is bundled on the
 * fly with esbuild (already present as a Vite/Astro dependency) into
 * `node_modules/.cache/scene-baseline/` with `gsap` left external, then
 * imported. Bundling is the lightest option that works here — it needs no
 * loader hook, no extra runtime dependency, and it keeps the script's `gsap`
 * and the scene's `gsap` the same module instance so the timeline can be driven
 * from outside.
 *
 * The DOM is jsdom. jsdom has no SVG layout engine, so `getCTM` is undefined
 * and GSAP treats the SVG nodes as ordinary elements: transforms land in
 * `style.transform` instead of a `transform` attribute. That is fine for a
 * fingerprint — it is deterministic, and both sides of a comparison see it.
 *
 * Usage:
 *   node scripts/scene-baseline.mjs [--out <dir>] [--scene <id>]
 *   node scripts/scene-baseline.mjs --compare [--out <dir>] [--scene <id>]
 *   node scripts/scene-baseline.mjs --verify [--scene <id>]
 *
 * The output directory defaults to `./.scene-baseline/` and is meant to stay
 * out of version control. `--verify` needs no snapshots at all: it checks only
 * the contract every scene has to keep, which is what a new scene should be
 * held to before there is anything to compare it against.
 */

import { createRequire } from 'node:module';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCENES_DIR = path.join(ROOT, 'src', 'scenes');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'scene-baseline');

/** Every scene, in the order the site lists them. */
const SCENE_IDS = [
  'circuit-breaker',
  'retry',
  'rate-limiter',
  'bulkhead',
  'cache-aside',
  'cache-invalidation',
  'database-connection-pool',
  'thread-pool',
  'middleware-pipeline',
  'n-plus-1-query',
  'tail-latency',
  'sticky-session',
  'web-queue-worker',
  'command-query-responsibility-segregation',
  'strangler-fig',
  'request-timeout',
];

/** Sampling grid: 481 points, 0.05s apart, covering 0 to 24 inclusive. */
const GRID_POINTS = 481;
/** Grid used for the cue pass and the forward/backward symmetry check. */
const FINE_STEP = 0.01;
/** A request group counts as visible above this opacity. */
const VISIBLE_OPACITY = 0.05;

// --- command line ---------------------------------------------------------

function parseArgs(argv) {
  const options = { compare: false, verify: false, out: './.scene-baseline', scenes: SCENE_IDS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--compare') options.compare = true;
    else if (arg === '--verify') options.verify = true;
    else if (arg === '--out') {
      i += 1;
      options.out = argv[i] ?? options.out;
    } else if (arg === '--scene') {
      i += 1;
      const id = argv[i];
      if (id) options.scenes = [id];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

// --- environment ----------------------------------------------------------

async function setUpDom() {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const win = dom.window;

  globalThis.window = win;
  globalThis.document = win.document;
  Object.defineProperty(globalThis, 'navigator', {
    value: win.navigator,
    configurable: true,
    writable: true,
  });
  const carried = [
    'Element',
    'HTMLElement',
    'SVGElement',
    'Node',
    'NodeList',
    'CSSStyleDeclaration',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'MutationObserver',
    'DocumentFragment',
  ];
  for (const name of carried) {
    if (win[name] !== undefined && globalThis[name] === undefined) globalThis[name] = win[name];
  }
  return win;
}

// --- loading a scene ------------------------------------------------------

/**
 * Bundles one scene's timeline and stage markup into a single module and
 * imports it. `gsap` stays external so the script and the scene share one copy.
 */
async function loadScene(id) {
  const esbuild = require('esbuild');
  const sceneDir = path.join(SCENES_DIR, id);
  const outfile = path.join(CACHE_DIR, `${id}.mjs`);

  await esbuild.build({
    stdin: {
      contents: [
        `export { default as scene } from './scene';`,
        `export { stageMarkup, SCENE_DURATION } from './stage';`,
      ].join('\n'),
      resolveDir: sceneDir,
      sourcefile: `${id}-baseline-entry.ts`,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    external: ['gsap'],
    outfile,
    logLevel: 'silent',
  });

  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}

// --- sampling -------------------------------------------------------------

const NUMBER = /-?\d+\.\d+/g;

/** Rounds every decimal inside a string to three places. */
function roundNumbers(value) {
  if (value === null || value === undefined) return null;
  return String(value).replace(NUMBER, (match) => String(Number(Number(match).toFixed(3))));
}

/**
 * A stable address for an element: its child index path from the stage root,
 * plus its tag name.
 *
 * The path alone already identifies the element, so the class list is not part
 * of it. That is deliberate: a class name is presentation, and adding a shared
 * widget class to markup that already had a scene-prefixed one must not read as
 * a behaviour change. Snapshots written before this rule carry the class list
 * in their keys and are normalised on the way in — see `stripKeyClasses`.
 */
function pathOf(element, root) {
  const parts = [];
  let node = element;
  while (node && node !== root) {
    const parent = node.parentNode;
    if (!parent) break;
    parts.unshift(String(Array.prototype.indexOf.call(parent.childNodes, node)));
    node = parent;
  }
  const tag = element.tagName ?? '?';
  return `${parts.join('/')}:${tag}`;
}

/** `4/2:rect.ca-ttl-fill#width` -> `4/2:rect#width`. */
const KEY_CLASSES = /^([^:]*:[^.@#]+)\.[^@#]*/;

function stripKeyClasses(key) {
  return key.replace(KEY_CLASSES, '$1');
}

/** Rewrites an older snapshot's keys into the class-free form. */
function normaliseSnapshotKeys(snapshot) {
  for (const frame of snapshot.frames ?? []) {
    if (frame.set) {
      const set = {};
      for (const [key, value] of Object.entries(frame.set)) set[stripKeyClasses(key)] = value;
      frame.set = set;
    }
    if (Array.isArray(frame.del)) frame.del = frame.del.map(stripKeyClasses);
  }
  return snapshot;
}

/**
 * Everything the timeline can move: the elements it tweens, plus the stage
 * root, plus anything carrying a `data-*` attribute.
 */
function collectWatched(tl, stage) {
  const targets = new Set();
  const tweens = tl.getChildren(true, true, false);
  for (const tween of tweens) {
    const list = typeof tween.targets === 'function' ? tween.targets() : [];
    for (const target of list) {
      if (target && typeof target.getAttribute === 'function') targets.add(target);
    }
  }
  targets.add(stage);
  for (const element of stage.querySelectorAll('*')) {
    const attributes = element.attributes;
    for (let i = 0; i < attributes.length; i += 1) {
      const name = attributes[i]?.name ?? '';
      if (name.startsWith('data-')) {
        targets.add(element);
        break;
      }
    }
  }

  const watched = [];
  for (const element of targets) {
    watched.push({ element, key: pathOf(element, stage) });
  }
  watched.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return watched;
}

/** Builds the flat key/value map that is one frame of the fingerprint. */
function sample(watched) {
  const state = Object.create(null);
  for (const { element, key } of watched) {
    const attributes = element.attributes;
    for (let i = 0; i < attributes.length; i += 1) {
      const attribute = attributes[i];
      if (!attribute) continue;
      if (attribute.name.startsWith('data-')) state[`${key}@${attribute.name}`] = attribute.value;
    }
    const style = element.style;
    const transform = (style && style.transform) || element.getAttribute('transform');
    if (transform) state[`${key}#transform`] = roundNumbers(transform);
    const opacity = (style && style.opacity) || element.getAttribute('opacity');
    if (opacity !== null && opacity !== undefined && opacity !== '') {
      state[`${key}#opacity`] = roundNumbers(opacity);
    }
    const width = element.getAttribute('width');
    if (width !== null) state[`${key}#width`] = roundNumbers(width);
    const dashoffset =
      (style && style.getPropertyValue('stroke-dashoffset')) ||
      element.getAttribute('stroke-dashoffset');
    if (dashoffset !== null && dashoffset !== undefined && dashoffset !== '') {
      state[`${key}#stroke-dashoffset`] = roundNumbers(dashoffset);
    }
  }
  return state;
}

/** Only the `data-*` half of a frame, for the direction symmetry check. */
function dataOnly(state) {
  const out = Object.create(null);
  for (const key of Object.keys(state)) {
    if (key.includes('@data-')) out[key] = state[key];
  }
  return out;
}

/** Turns a frame into what changed since the frame before it. */
function encodeFrame(previous, current) {
  const set = {};
  const del = [];
  for (const key of Object.keys(current)) {
    if (previous[key] !== current[key]) set[key] = current[key];
  }
  for (const key of Object.keys(previous)) {
    if (!(key in current)) del.push(key);
  }
  return { set, del };
}

function applyFrame(previous, frame) {
  const next = { ...previous };
  for (const key of frame.del ?? []) delete next[key];
  Object.assign(next, frame.set ?? {});
  return next;
}

function visibleRequests(stage) {
  let count = 0;
  for (const group of stage.querySelectorAll('.scene-req')) {
    const raw = group.style?.opacity ?? group.getAttribute('opacity');
    const value = raw === null || raw === undefined || raw === '' ? 1 : Number(raw);
    if (Number.isFinite(value) && value > VISIBLE_OPACITY) count += 1;
  }
  return count;
}

// --- one scene ------------------------------------------------------------

async function runScene(id) {
  const module = await loadScene(id);
  const { scene, stageMarkup, SCENE_DURATION } = module;

  document.body.innerHTML = stageMarkup;
  const stage = document.body.querySelector('svg');
  if (!stage) throw new Error(`${id}: stage markup has no root svg`);

  const cues = [];
  let cueClock = 0;
  const cue = (name) => {
    cues.push([Number(cueClock.toFixed(3)), name]);
  };

  const { tl, steps } = scene.build(stage, { cue });
  cues.length = 0; // Anything raised while building is not a playback cue.

  const watched = collectWatched(tl, stage);
  const duration = tl.duration();

  // --- the 481 point grid, forwards then backwards ------------------------
  const frames = [];
  let previous = Object.create(null);
  const pushFrame = (dir, index, time) => {
    const current = sample(watched);
    frames.push({ dir, i: index, t: Number(time.toFixed(3)), ...encodeFrame(previous, current) });
    previous = current;
    return current;
  };

  let firstForward = null;
  let lastForward = null;
  let firstVisible = 0;
  let lastVisible = 0;

  for (let i = 0; i < GRID_POINTS; i += 1) {
    const progress = i / (GRID_POINTS - 1);
    tl.progress(progress, true);
    const current = pushFrame('fwd', i, progress * duration);
    if (i === 0) {
      firstForward = current;
      firstVisible = visibleRequests(stage);
    }
    if (i === GRID_POINTS - 1) {
      lastForward = current;
      lastVisible = visibleRequests(stage);
    }
  }
  for (let i = GRID_POINTS - 1; i >= 0; i -= 1) {
    const progress = i / (GRID_POINTS - 1);
    tl.progress(progress, true);
    pushFrame('rev', i, progress * duration);
  }

  // --- forward and backward have to agree, at a finer grid ----------------
  tl.progress(0, true);
  const forwardData = [];
  const fineCount = Math.round(duration / FINE_STEP) + 1;
  for (let i = 0; i < fineCount; i += 1) {
    tl.time(Math.min(i * FINE_STEP, duration), true);
    forwardData.push(dataOnly(sample(watched)));
  }
  let symmetry = { ok: true, at: null, key: null, forward: null, backward: null };
  for (let i = fineCount - 1; i >= 0; i -= 1) {
    tl.time(Math.min(i * FINE_STEP, duration), true);
    const back = dataOnly(sample(watched));
    const forth = forwardData[i] ?? {};
    if (!symmetry.ok) continue;
    const keys = new Set([...Object.keys(forth), ...Object.keys(back)]);
    for (const key of keys) {
      if (forth[key] !== back[key]) {
        symmetry = {
          ok: false,
          at: Number((i * FINE_STEP).toFixed(3)),
          key,
          forward: forth[key] ?? null,
          backward: back[key] ?? null,
        };
        break;
      }
    }
  }

  // --- cues, played once with events live ---------------------------------
  tl.time(0, true);
  cues.length = 0;
  for (let i = 0; i < fineCount; i += 1) {
    const at = Math.min(i * FINE_STEP, duration);
    cueClock = at;
    tl.time(at, false);
  }
  const cueCounts = {};
  for (const [, name] of cues) cueCounts[name] = (cueCounts[name] ?? 0) + 1;

  const labels = {};
  for (const [name, at] of Object.entries(tl.labels ?? {})) labels[name] = Number(at.toFixed(3));

  tl.progress(0, true);
  tl.kill();

  const stepNames = ['step-1', 'step-2', 'step-3', 'step-4'];
  const contract = {
    durationIs24: Math.abs(duration - 24) < 1e-9,
    moduleDurationMatchesStage: scene.duration === SCENE_DURATION,
    moduleIdMatches: scene.id === id,
    fourLabels: stepNames.every((name) => name in labels),
    labelsAscending: stepNames.every(
      (name, index) => index === 0 || (labels[stepNames[index - 1]] ?? 0) < (labels[name] ?? -1),
    ),
    stepsMatchLabels:
      Array.isArray(steps) &&
      steps.length === 4 &&
      steps.every((step, index) => step.time === labels[stepNames[index]]),
    firstFrameHasNoRequests: firstVisible === 0,
    lastFrameHasNoRequests: lastVisible === 0,
    symmetric: symmetry.ok,
  };

  return {
    version: 1,
    scene: id,
    duration: Number(duration.toFixed(6)),
    moduleDuration: scene.duration,
    stageDuration: SCENE_DURATION,
    steps: steps.map((step) => ({ id: step.id, label: step.label, time: step.time })),
    labels,
    watched: watched.length,
    requestGroups: stage.querySelectorAll('.scene-req').length,
    firstFrameVisibleRequests: firstVisible,
    lastFrameVisibleRequests: lastVisible,
    symmetry,
    contract,
    cueCounts,
    cues,
    frames,
    _first: firstForward,
    _last: lastForward,
  };
}

// --- comparing ------------------------------------------------------------

function reconstruct(frames) {
  const states = [];
  let previous = Object.create(null);
  for (const frame of frames) {
    previous = applyFrame(previous, frame);
    states.push(previous);
  }
  return states;
}

function firstFrameDifference(storedFrames, freshFrames) {
  const stored = reconstruct(storedFrames);
  const fresh = reconstruct(freshFrames);
  const count = Math.min(stored.length, fresh.length);
  for (let i = 0; i < count; i += 1) {
    const a = stored[i] ?? {};
    const b = fresh[i] ?? {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const differing = [];
    for (const key of keys) {
      if (a[key] !== b[key]) differing.push(key);
    }
    if (differing.length > 0) {
      const frame = freshFrames[i] ?? storedFrames[i];
      return {
        index: i,
        dir: frame?.dir,
        gridIndex: frame?.i,
        time: frame?.t,
        keys: differing.sort().slice(0, 8),
        stored: Object.fromEntries(differing.sort().slice(0, 8).map((key) => [key, a[key] ?? null])),
        fresh: Object.fromEntries(differing.sort().slice(0, 8).map((key) => [key, b[key] ?? null])),
        total: differing.length,
      };
    }
  }
  if (stored.length !== fresh.length) {
    return { index: count, lengthMismatch: [storedFrames.length, freshFrames.length] };
  }
  return null;
}

function compareSnapshots(stored, fresh) {
  const problems = [];

  if (stored.duration !== fresh.duration) {
    problems.push(`duration ${stored.duration} -> ${fresh.duration}`);
  }
  if (JSON.stringify(stored.labels) !== JSON.stringify(fresh.labels)) {
    problems.push(`labels ${JSON.stringify(stored.labels)} -> ${JSON.stringify(fresh.labels)}`);
  }
  if (JSON.stringify(stored.steps) !== JSON.stringify(fresh.steps)) {
    problems.push('steps changed');
  }
  if (JSON.stringify(stored.cueCounts) !== JSON.stringify(fresh.cueCounts)) {
    problems.push(
      `cue counts ${JSON.stringify(stored.cueCounts)} -> ${JSON.stringify(fresh.cueCounts)}`,
    );
  }
  if (JSON.stringify(stored.cues) !== JSON.stringify(fresh.cues)) {
    const count = Math.min(stored.cues.length, fresh.cues.length);
    let where = `lengths ${stored.cues.length} vs ${fresh.cues.length}`;
    for (let i = 0; i < count; i += 1) {
      if (JSON.stringify(stored.cues[i]) !== JSON.stringify(fresh.cues[i])) {
        where = `first at #${i}: ${JSON.stringify(stored.cues[i])} -> ${JSON.stringify(fresh.cues[i])}`;
        break;
      }
    }
    problems.push(`cue list differs (${where})`);
  }
  if (stored.requestGroups !== fresh.requestGroups) {
    problems.push(`request groups ${stored.requestGroups} -> ${fresh.requestGroups}`);
  }
  if (JSON.stringify(stored.contract) !== JSON.stringify(fresh.contract)) {
    problems.push(
      `contract ${JSON.stringify(stored.contract)} -> ${JSON.stringify(fresh.contract)}`,
    );
  }

  const difference = firstFrameDifference(stored.frames, fresh.frames);
  if (difference) {
    if (difference.lengthMismatch) {
      problems.push(`frame count ${difference.lengthMismatch.join(' -> ')}`);
    } else {
      problems.push(
        `first differing sample: ${difference.dir} #${difference.gridIndex} at t=${difference.time} ` +
          `(${difference.total} key(s))\n` +
          difference.keys
            .map(
              (key) =>
                `      ${key}\n        stored: ${JSON.stringify(difference.stored[key])}\n        now:    ${JSON.stringify(difference.fresh[key])}`,
            )
            .join('\n'),
      );
    }
  }

  return problems;
}

// --- contract report ------------------------------------------------------

/** The four sounds a scene is allowed to raise. */
const CUE_NAMES = ['success', 'failure', 'state', 'trip'];

function contractProblems(snapshot) {
  const failures = [];
  const c = snapshot.contract;
  if (!c.durationIs24) failures.push(`duration is ${snapshot.duration}, not 24`);
  if (!c.moduleDurationMatchesStage) {
    failures.push(`SceneModule.duration ${snapshot.moduleDuration} != stage ${snapshot.stageDuration}`);
  }
  if (!c.moduleIdMatches) failures.push('SceneModule.id does not match the folder name');
  if (!c.fourLabels) failures.push('missing one of step-1..step-4');
  if (!c.labelsAscending) failures.push('step labels are not in ascending order');
  if (!c.stepsMatchLabels) failures.push('steps[] times do not match the timeline labels');
  if (!c.firstFrameHasNoRequests) {
    failures.push(`${snapshot.firstFrameVisibleRequests} request group(s) visible on the first frame`);
  }
  if (!c.lastFrameHasNoRequests) {
    failures.push(`${snapshot.lastFrameVisibleRequests} request group(s) visible on the last frame`);
  }
  if (!c.symmetric) {
    const s = snapshot.symmetry;
    failures.push(
      `forward/backward disagree at t=${s.at} on ${s.key} (${JSON.stringify(s.forward)} vs ${JSON.stringify(s.backward)})`,
    );
  }

  // Cues are the scene's other output. A scene that raises none is either
  // silent by mistake or wiring its sounds outside the timeline.
  if (snapshot.cues.length === 0) {
    failures.push('no sound cue was raised during playback');
  }
  const unknown = [...new Set(snapshot.cues.map(([, name]) => name))].filter(
    (name) => !CUE_NAMES.includes(name),
  );
  if (unknown.length > 0) {
    failures.push(`cue name(s) outside the vocabulary: ${unknown.join(', ')}`);
  }
  for (let i = 1; i < snapshot.cues.length; i += 1) {
    if (snapshot.cues[i][0] < snapshot.cues[i - 1][0]) {
      failures.push(
        `cues are not in time order: #${i} at ${snapshot.cues[i][0]} follows ${snapshot.cues[i - 1][0]}`,
      );
      break;
    }
  }
  return failures;
}

// --- main -----------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      [
        'Usage: node scripts/scene-baseline.mjs [--compare|--verify] [--out <dir>] [--scene <id>]',
        '',
        '  --compare      compare against the stored snapshots instead of writing them',
        '  --verify       check the scene contract only; needs no snapshots',
        '  --out <dir>    snapshot directory (default ./.scene-baseline)',
        '  --scene <id>   only this scene',
        '',
      ].join('\n'),
    );
    return 0;
  }

  const outDir = path.resolve(ROOT, options.out);
  await mkdir(CACHE_DIR, { recursive: true });
  if (!options.compare && !options.verify) await mkdir(outDir, { recursive: true });
  await setUpDom();

  let failed = 0;
  for (const id of options.scenes) {
    const target = path.join(outDir, `${id}.json`);
    let snapshot;
    try {
      snapshot = await runScene(id);
    } catch (error) {
      failed += 1;
      process.stdout.write(`FAIL  ${id}  build threw: ${error?.stack ?? error}\n`);
      continue;
    }

    const { _first, _last, ...stored } = snapshot;
    const failures = contractProblems(snapshot);

    if (options.verify) {
      if (failures.length === 0) {
        process.stdout.write(
          `PASS  ${id}  ${stored.duration.toFixed(2)}s, ${stored.steps.length} steps, ` +
            `${stored.cues.length} cues (${Object.entries(stored.cueCounts)
              .map(([name, count]) => `${name}:${count}`)
              .join(' ')})\n`,
        );
      } else {
        failed += 1;
        process.stdout.write(`FAIL  ${id}\n`);
        for (const failure of failures) process.stdout.write(`    ${failure}\n`);
      }
    } else if (options.compare) {
      if (!existsSync(target)) {
        failed += 1;
        process.stdout.write(`FAIL  ${id}  no snapshot at ${path.relative(ROOT, target)}\n`);
        continue;
      }
      const previous = normaliseSnapshotKeys(JSON.parse(await readFile(target, 'utf8')));
      const problems = compareSnapshots(previous, stored);
      if (problems.length === 0 && failures.length === 0) {
        process.stdout.write(
          `PASS  ${id}  ${stored.frames.length} samples, ${stored.cues.length} cues ` +
            `(${Object.entries(stored.cueCounts)
              .map(([name, count]) => `${name}:${count}`)
              .join(' ')})\n`,
        );
      } else {
        failed += 1;
        process.stdout.write(`FAIL  ${id}\n`);
        for (const problem of [...problems, ...failures.map((f) => `contract: ${f}`)]) {
          process.stdout.write(`    ${problem}\n`);
        }
      }
    } else {
      await writeFile(target, `${JSON.stringify(stored)}\n`, 'utf8');
      const label = failures.length === 0 ? 'WROTE' : 'WROTE*';
      process.stdout.write(
        `${label} ${id}  ${stored.frames.length} samples, ${stored.watched} watched elements, ` +
          `${stored.cues.length} cues (${Object.entries(stored.cueCounts)
            .map(([name, count]) => `${name}:${count}`)
            .join(' ')})\n`,
      );
      for (const failure of failures) process.stdout.write(`    contract: ${failure}\n`);
      if (failures.length > 0) failed += 1;
    }
  }

  await rm(CACHE_DIR, { recursive: true, force: true });

  if (options.verify) {
    process.stdout.write(
      failed === 0
        ? `\nAll ${options.scenes.length} scenes keep the contract.\n`
        : `\n${failed} of ${options.scenes.length} scenes break the contract.\n`,
    );
  } else if (options.compare) {
    process.stdout.write(
      failed === 0
        ? `\nAll ${options.scenes.length} scenes match the baseline.\n`
        : `\n${failed} of ${options.scenes.length} scenes differ from the baseline.\n`,
    );
  }
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  },
);
