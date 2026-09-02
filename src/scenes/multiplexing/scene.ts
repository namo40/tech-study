import {
  KEYS,
  SCENE_DURATION,
  X_LANE,
  Y_CLIENT,
  Y_CONN_BOTTOM,
  Y_CONN_TOP,
  Y_SERVER,
} from './stage';
import type { Key, Mode } from './stage';
import { q, qa } from '../shared/dom';
import {
  hideRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Multiplexing scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader watches is placed by hand. The scene is told four things
 * per run: which protocol the wire speaks, how many requests that protocol lets
 * onto it at once, whether answers have to come back in the order they were
 * asked, and when each of the three requests is handed over along with how long
 * the server will spend on it. One pass over the whole 24 seconds turns that
 * into everything else — who is occupying the connection, how many requests are
 * stuck behind it, which finished answers the server is not allowed to send,
 * what order the completion slots fill in, and where every sound falls.
 *
 * Three derivations carry the scene, and they are the argument it is making.
 * Occupancy is a lookup, not a script: `busy:` names the earliest-sent request
 * still in flight, which under HTTP/1.1 is the only one there is and under
 * pipelining is whoever the answers are queued behind. A request waits when the
 * connection has no room for it, so the same rule produces `waiting 2` under a
 * protocol with one slot and `waiting 0` under one with three, without either
 * number being written down. And the order the slots fill in is the order
 * answers were released, so the step where B lands before C and C before A
 * happens because A's service time is longer than theirs, not because anybody
 * said B first.
 */

const ID = 'multiplexing';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** Seconds a hop takes on each lane. Both run at very nearly one speed. */
const LEG_TOP = 0.2;
const LEG_BOTTOM = 0.24;
/** Seconds the connection spends handing a request from one lane to the other. */
const DWELL = 0.06;
/** How long a traveller takes to fade once the box it reached has absorbed it. */
const FADE = 0.06;
/** Seconds between one round trip finishing and the next one being allowed out. */
const HANDOFF = 0.12;

/** Service this long or longer is what the `slow` badge is for. */
const SLOW_AT = 1;

// --- what the scene is told ------------------------------------------------

interface Ask {
  key: Key;
  /** When the client hands this request to the connection. */
  at: number;
  /** Seconds the server spends on it before the answer is ready. */
  serve: number;
}

interface Phase {
  mode: Mode;
  /** How many requests this protocol lets onto the wire at once. */
  capacity: number;
  /** Whether answers have to come back in the order they were asked. */
  ordered: boolean;
  /** When the client's three chips light up as `ready` for this run. */
  ready: number;
  /** When the mode chip is asserted, with a ring around it. */
  assert: number | null;
  /** The sound that assertion makes. */
  cue: SceneCue | null;
  /** When HTTP/2 opens its three streams, for the run that has them. */
  open: number | null;
  asks: Ask[];
}

/**
 * The four runs. Every number below is an input; nothing else in this file is.
 *
 * A is the expensive request in every run but the first, and B and C are cheap
 * in all four. That is the whole of the asymmetry the scene is about: one slow
 * answer among three, moved through four protocols to see what each does with
 * it. The service times never change between runs two, three and four, so any
 * difference the reader sees between those runs came from the protocol.
 */
const SERVE_QUICK = 0.34;
const SERVE_LAST = 0.46;
const SERVE_SLOW = 1.26;

const PHASES: Phase[] = [
  {
    mode: 'http11',
    capacity: 1,
    ordered: true,
    ready: 0.5,
    assert: 0.5,
    cue: 'state',
    open: null,
    asks: [
      { key: 'a', at: 0.8, serve: SERVE_QUICK },
      { key: 'b', at: 2.4, serve: SERVE_QUICK },
      { key: 'c', at: 4.0, serve: SERVE_LAST },
    ],
  },
  {
    mode: 'http11',
    capacity: 1,
    ordered: true,
    ready: 6.2,
    assert: null,
    cue: null,
    open: null,
    asks: [
      { key: 'a', at: 6.32, serve: SERVE_SLOW },
      { key: 'b', at: 6.32, serve: SERVE_QUICK },
      { key: 'c', at: 6.32, serve: SERVE_LAST },
    ],
  },
  {
    mode: 'pipelining',
    capacity: 3,
    ordered: true,
    ready: 12.4,
    assert: 12.6,
    cue: 'trip',
    open: null,
    asks: [
      { key: 'a', at: 13.6, serve: SERVE_SLOW },
      { key: 'b', at: 13.92, serve: SERVE_QUICK },
      { key: 'c', at: 14.24, serve: SERVE_LAST },
    ],
  },
  {
    mode: 'http2',
    capacity: 3,
    ordered: false,
    ready: 18.25,
    assert: 18.4,
    cue: 'trip',
    open: 18.8,
    asks: [
      { key: 'a', at: 19.5, serve: SERVE_SLOW },
      { key: 'b', at: 19.64, serve: SERVE_QUICK },
      { key: 'c', at: 19.78, serve: SERVE_LAST },
    ],
  },
];

/** How long the ring around the mode chip stays up once it has been asserted. */
const MARK_HOLD = 0.4;

/** The closing beat: the slot row is held up, and then the stage settles. */
const ORDER_AT = 22.1;
const SETTLE_AT = 22.6;

// --- what one pass over the scene produces --------------------------------

interface Series {
  at: number;
  value: string;
}

/** A value the stage shows, and the entries that change it. */
interface Track {
  series: Series[];
  value: string;
}

interface Traveller {
  key: Key;
  /** Which way it is going, which is what tells a request from an answer. */
  dir: 'down' | 'up';
  from: number;
  to: number;
  start: number;
  duration: number;
}

interface Simulation {
  travellers: Traveller[];
  stage: Record<string, Track>;
  chip: Record<Key, Track>;
  slot: Track[];
  stream: Record<Key, Track>;
  serve: Record<Key, Track>;
  hold: Record<Key, Track>;
  cues: [number, SceneCue][];
}

const byKey = <T>(make: () => T): Record<Key, T> => ({ a: make(), b: make(), c: make() });

const track = (initial: string): Track => ({ series: [], value: initial });

/**
 * Walks the whole scene in time order.
 *
 * The connection holds three small pieces of state: how many requests it will
 * carry, which of them it has accepted, and whether the answers it is bringing
 * back have an order to keep. Every request that is handed to it asks the first
 * two — is there room for me, and if not, who is in front — and every answer
 * that comes off the server asks the third. Those three questions are the only
 * thing that decides what the reader sees.
 */
function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const cues: [number, SceneCue][] = [];

  const stage: Record<string, Track> = {
    mode: track('http11'),
    busy: track('none'),
    wait: track('0'),
    done: track('0'),
    slow: track('off'),
    gate: track('open'),
    mark: track('off'),
    order: track('off'),
    settled: track('off'),
  };
  const chip = byKey(() => track('idle'));
  const slot = [track('none'), track('none'), track('none')];
  const stream = byKey(() => track('off'));
  const serve = byKey(() => track('off'));
  const hold = byKey(() => track('off'));

  const set = (target: Track, at: number, next: string): void => {
    if (target.value === next) return;
    target.value = next;
    collapseAtInstant(target.series, { at: round(at), value: next }, () => 'value');
  };

  const cue = (at: number, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    cues.push([round(at), name]);
  };

  // --- what the connection currently is -----------------------------------

  let mode: Mode = 'http11';
  let capacity = 1;
  let ordered = true;

  /** Handed over and not yet accepted; accepted and not yet home. */
  let pending: Key[] = [];
  const accepted: Key[] = [];
  const flying = new Set<Key>();

  /** Answers off the server that have not been let onto the wire yet. */
  const finished = new Map<Key, number>();
  const released = new Set<Key>();
  const serveFor = new Map<Key, number>();

  /** When the lane back up from the server is next free. */
  let laneFree = 0;
  /** Answers the server has finished and the protocol will not let out yet. */
  const heldKeys = new Set<Key>();
  let slowNow = 0;
  let landed = 0;
  let slots = 0;
  let mostFlying = 0;

  /** Sounds that say something once, the first time the scene has it to say. */
  let slowCued = false;
  let waitCued = false;
  let peakCued = false;

  const { schedule, drain } = createScheduler();

  /**
   * `busy:` names the earliest-sent request still in flight. Under HTTP/1.1
   * that is the only one there is; under pipelining it is the one every other
   * answer is queued behind, which is the same fact said about a longer queue.
   * Under HTTP/2 there is no such request, and the stream tags answer instead.
   */
  const syncBusy = (at: number): void => {
    if (mode === 'http2') {
      set(stage.busy, at, 'none');
      return;
    }
    set(stage.busy, at, accepted.find((key) => flying.has(key)) ?? 'none');
  };

  const syncWait = (at: number): void => {
    set(stage.wait, at, String(pending.length));
    if (pending.length > 0 && !waitCued) {
      waitCued = true;
      cue(at, 'state');
    }
  };

  // --- one request, from the moment the connection takes it ----------------

  function send(key: Key, at: number): void {
    flying.add(key);
    accepted.push(key);
    set(chip[key], at, 'sent');
    if (mode === 'http2') set(stream[key], at, 'live');

    travellers.push({
      key,
      dir: 'down',
      from: Y_CLIENT,
      to: Y_CONN_TOP,
      start: at,
      duration: LEG_TOP,
    });
    const onward = round(at + LEG_TOP + DWELL);
    travellers.push({
      key,
      dir: 'down',
      from: Y_CONN_BOTTOM,
      to: Y_SERVER,
      start: onward,
      duration: LEG_BOTTOM,
    });

    const cost = serveFor.get(key) ?? 0;
    const reaches = round(onward + LEG_BOTTOM);
    schedule(reaches, () => {
      set(serve[key], reaches, 'on');
      if (cost < SLOW_AT) return;
      slowNow += 1;
      set(stage.slow, reaches, 'on');
      if (!slowCued) {
        slowCued = true;
        cue(reaches, 'state');
      }
      // Half way through a slow answer is the worst the queue behind it ever
      // gets, so that is where the wait sounds — if there is a queue at all.
      const peak = round(reaches + cost / 2);
      schedule(peak, () => {
        if (pending.length === 0 || peakCued) return;
        peakCued = true;
        cue(peak, 'failure');
      });
    });

    const answers = round(reaches + cost);
    schedule(answers, () => {
      set(serve[key], answers, 'off');
      if (cost >= SLOW_AT) {
        slowNow -= 1;
        if (slowNow === 0) set(stage.slow, answers, 'off');
      }
      finished.set(key, answers);
      // Offer it to the wire first: an answer that goes straight out was never
      // held, and the bar across the way out is only for the ones that are.
      tryRelease(answers);
      if (!finished.has(key)) return;
      heldKeys.add(key);
      set(hold[key], answers, 'on');
      set(stage.gate, answers, 'shut');
      cue(answers, heldKeys.size === 1 ? 'state' : 'failure');
    });

    syncBusy(at);
    if (flying.size <= mostFlying) return;
    mostFlying = flying.size;
    // Two requests on one connection at once is the thing itself, so it sounds.
    if (flying.size === 2) cue(at, 'state');
  }

  /** Whichever answer the protocol allows out next, or nothing while it blocks. */
  function nextOut(): Key | null {
    if (ordered) {
      const head = accepted.find((key) => !released.has(key));
      return head !== undefined && finished.has(head) ? head : null;
    }
    let best: Key | null = null;
    let bestAt = Infinity;
    for (const [key, when] of finished) {
      if (when < bestAt) {
        bestAt = when;
        best = key;
      }
    }
    return best;
  }

  function tryRelease(at: number): void {
    for (;;) {
      const key = nextOut();
      if (!key) return;
      const when = round(Math.max(finished.get(key) ?? at, laneFree));
      if (when > at) {
        schedule(when, () => tryRelease(when));
        return;
      }
      release(key, at);
    }
  }

  function release(key: Key, at: number): void {
    released.add(key);
    finished.delete(key);
    if (heldKeys.delete(key)) {
      set(hold[key], at, 'off');
      if (heldKeys.size === 0) set(stage.gate, at, 'open');
    }
    laneFree = round(at + LEG_BOTTOM);

    travellers.push({
      key,
      dir: 'up',
      from: Y_SERVER,
      to: Y_CONN_BOTTOM,
      start: at,
      duration: LEG_BOTTOM,
    });
    const onward = round(at + LEG_BOTTOM + DWELL);
    travellers.push({
      key,
      dir: 'up',
      from: Y_CONN_TOP,
      to: Y_CLIENT,
      start: onward,
      duration: LEG_TOP,
    });

    const home = round(onward + LEG_TOP);
    schedule(home, () => arrive(key, home));
  }

  function arrive(key: Key, at: number): void {
    flying.delete(key);
    set(chip[key], at, 'done');
    if (mode === 'http2') set(stream[key], at, 'done');
    const seat = slot[slots];
    if (seat) set(seat, at, key);
    slots += 1;
    landed += 1;
    set(stage.done, at, String(landed));
    cue(at, 'success');
    syncBusy(at);
    const free = round(at + HANDOFF);
    schedule(free, () => pump(free));
  }

  function pump(at: number): void {
    while (pending.length > 0 && flying.size < capacity) {
      const next = pending.shift();
      if (next) send(next, at);
    }
    syncWait(at);
  }

  // --- the four runs the scene is given ------------------------------------

  for (const phase of PHASES) {
    schedule(phase.ready, () => {
      capacity = phase.capacity;
      ordered = phase.ordered;
      pending = [];
      accepted.length = 0;
      flying.clear();
      finished.clear();
      released.clear();
      serveFor.clear();
      laneFree = 0;
      heldKeys.clear();
      slowNow = 0;
      landed = 0;
      slots = 0;
      mostFlying = 0;
      for (const key of KEYS) set(chip[key], phase.ready, 'ready');
      for (const seat of slot) set(seat, phase.ready, 'none');
      set(stage.done, phase.ready, '0');
      set(stage.wait, phase.ready, '0');
      set(stage.gate, phase.ready, 'open');
      syncBusy(phase.ready);
    });

    const assert = phase.assert;
    if (assert !== null) {
      schedule(assert, () => {
        if (phase.mode !== mode) {
          mode = phase.mode;
          set(stage.mode, assert, mode);
          syncBusy(assert);
        }
        set(stage.mark, assert, 'on');
        if (phase.cue) cue(assert, phase.cue);
      });
      schedule(round(assert + MARK_HOLD), () => set(stage.mark, assert + MARK_HOLD, 'off'));
    }

    const open = phase.open;
    if (open !== null) {
      schedule(open, () => {
        for (const key of KEYS) set(stream[key], open, 'open');
        cue(open, 'state');
      });
    }

    for (const ask of phase.asks) {
      schedule(ask.at, () => {
        serveFor.set(ask.key, ask.serve);
        pending.push(ask.key);
        pump(ask.at);
      });
    }
  }

  schedule(ORDER_AT, () => {
    set(stage.order, ORDER_AT, 'on');
    cue(ORDER_AT, 'state');
  });
  schedule(SETTLE_AT, () => {
    set(stage.order, SETTLE_AT, 'off');
    set(stage.settled, SETTLE_AT, 'on');
  });

  drain();
  cues.sort((left, right) => left[0] - right[0]);

  return { travellers, stage, chip, slot, stream, serve, hold, cues };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- everything the stage says about itself -----------------------------

  for (const [name, value] of Object.entries(sim.stage)) {
    for (const entry of value.series) attr(tl, stage, `data-mux-${name}`, entry.value, entry.at);
  }

  // The rows below are written in `KEYS` order, so the element an index names is
  // the request the simulation named.
  const rows = <T extends Element>(selector: string): T[] => qa<T>(stage, selector);
  const chips = rows<SVGGElement>('.mux-chip');
  const fills = rows<SVGGElement>('.mux-fill');
  const streams = rows<SVGGElement>('.mux-stream');
  const serves = rows<SVGCircleElement>('.mux-serve');
  const holds = rows<SVGCircleElement>('.mux-hold');

  KEYS.forEach((key, index) => {
    const pairs: [Element | undefined, string, { series: { at: number; value: string }[] }][] = [
      [chips[index], 'data-mux-chip', sim.chip[key]],
      [streams[index], 'data-mux-stream', sim.stream[key]],
      [serves[index], 'data-mux-serve', sim.serve[key]],
      [holds[index], 'data-mux-hold', sim.hold[key]],
    ];
    for (const [element, name, value] of pairs) {
      if (!element) continue;
      for (const entry of value.series) attr(tl, element, name, entry.value, entry.at);
    }
  });

  sim.slot.forEach((seat, index) => {
    const element = fills[index];
    if (!element) return;
    for (const entry of seat.series) attr(tl, element, 'data-mux-slot', entry.value, entry.at);
  });

  // --- the travellers -----------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const parts = requests[index];
    if (!parts) return;
    parts.group.classList.add(`mux-req--${traveller.key}`, `mux-req--${traveller.dir}`);

    const lands = round(traveller.start + traveller.duration);
    parkRequest(parts, X_LANE, traveller.from);
    showRequest(tl, parts, traveller.start);
    moveRequest(tl, parts, traveller.to, traveller.duration, traveller.start);
    hideRequest(tl, parts, lands, FADE);
  });

  // --- sounds and step labels ---------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // The stage is complete on the first frame: a connection speaking HTTP/1.1,
  // three requests the client has not asked yet, and nothing on either lane.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
