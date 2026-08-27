import {
  LANES,
  RING_CIRCUMFERENCE,
  RUN_SLOTS,
  SCENE_DURATION,
  Y_INST,
  Y_STORE,
  Y_STRIP,
  Y_WORK,
} from './stage';
import type { Role } from './stage';
import { q } from '../shared/dom';
import {
  haloRequest,
  hideRequest,
  markRequest,
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
 * Leader Election scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader watches is placed by hand. The scene is told when each
 * instance starts asking, how long a lease lives, how much of it has to be left
 * before the holder renews, how often a follower looks again, how often the
 * leader emits a unit of work, and the two moments the world is unkind to A:
 * when it stops answering and when it comes back. One pass over the whole 24
 * seconds turns that into everything else.
 *
 * Who leads is never authored. Three requests set out and the store answers
 * them in the order they arrive, so A wins because it started first and by a
 * margin the reader can see. The epoch is a count of grants. The ring is the
 * lease drawn as time, so it empties exactly when the store would stop
 * believing the holder, and refills exactly when a renewal reaches it. The
 * re-election delay is not a number either: the seat sits empty until the next
 * follower happens to look, which is why the work strip has a gap in it and why
 * the gap is as long as it is. And `dup` counts units of work whose flights
 * overlap under different holders, which is the thing all of this exists to
 * keep at nought.
 */

const ID = 'leader-election';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

type Who = 'A' | 'B' | 'C';
const WHO: Who[] = ['A', 'B', 'C'];

// --- how a traveller moves -------------------------------------------------

/** Seconds a lease call takes between an instance box and the store, each way. */
const LEG = 0.32;
/** Seconds a unit of work takes from the leader's box down to the strip. */
const TICK_LEG = 0.26;
/** How long a traveller takes to fade once it has been answered or absorbed. */
const FADE = 0.08;

// --- what the scene is told ------------------------------------------------

/** When A first asks for the lease, and how much later each other one does. */
const BOOT = 1.275;
const STAGGER = 0.08;

/** How long a lease lives without a renewal reaching the store. */
const TTL = 2.2;
/** The share of the ring still left when the holder sends its renewal. */
const RENEW_AT = 0.25;

/** How often each follower looks again, which is also how it tries to take over. */
const WATCH: Record<Who, number> = { A: 4.06, B: 4.06, C: 2.52 };

/** When the leader emits its first unit of work, and how often after that. */
const JOB_DELAY = 0.93;
const JOB_EVERY = 1.38;

/** The two unkind moments: A stops answering, and A comes back. */
const CRASH = 12.5;
const RESTART = 15.8;

/** When the strip is called out, and the window the duplicate count is held up. */
const MARK_AT = 18.4;
const PULSE_FROM = 21.6;
const PULSE_TO = 22.4;

/** How often a live ring makes a sound as it winds down. */
const RING_CUE_EVERY = 1.9;
/** One unit of work in this many raises a sound, so a steady cadence is not a rattle. */
const TICK_CUE_EVERY = 2;
/** The closing chord, once everything has settled. */
const FINALE_AT = 23.8;

// --- what one pass over the scene produces --------------------------------

type TravellerKind = 'acquire' | 'renew' | 'watch' | 'tick';

interface Traveller {
  kind: TravellerKind;
  lane: number;
  start: number;
  /** Whether the store said yes. Ticks always land. */
  ok: boolean;
  /** Whether it wears a ring while it travels. */
  ringed: boolean;
}

interface RingSegment {
  at: number;
  until: number;
  from: number;
  to: number;
}

interface Series<T> {
  at: number;
  value: T;
}

interface Slot {
  at: number;
  index: number;
}

interface Simulation {
  travellers: Traveller[];
  holder: Series<string>[];
  epoch: Series<number>[];
  roles: Record<Who, Series<Role>[]>;
  runs: Series<number>[];
  dup: Series<number>[];
  mark: Series<string>[];
  pulse: Series<string>[];
  slots: Slot[];
  ring: RingSegment[];
  cues: [number, SceneCue][];
  /** The cell the first epoch's work ended on, which is where the line goes. */
  boundary: number;
}

/**
 * Walks the whole scene in time order.
 *
 * The store is one small piece of state: who holds the record, which grant it
 * was, and the instant it stops believing them. Every call that reaches the
 * store asks it what it holds right now, and the answer is the only thing that
 * decides whether the caller is a leader afterwards.
 */
function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const holder: Series<string>[] = [];
  const epoch: Series<number>[] = [];
  const roles: Record<Who, Series<Role>[]> = { A: [], B: [], C: [] };
  const runs: Series<number>[] = [];
  const dup: Series<number>[] = [];
  const mark: Series<string>[] = [];
  const pulse: Series<string>[] = [];
  const slots: Slot[] = [];
  const ring: RingSegment[] = [];
  const cues: [number, SceneCue][] = [];

  /** The record the whole scene is about. */
  let held: 'none' | Who = 'none';
  let grants = 0;
  let expiresAt = -1;
  let generation = 0;

  /** What each instance is, and which grant it thinks it is working under. */
  const alive: Record<Who, boolean> = { A: true, B: true, C: true };
  const role: Record<Who, Role> = { A: 'follower', B: 'follower', C: 'follower' };
  /** Whether a follower already has a watch running, so a refusal never starts a second one. */
  const watching: Record<Who, boolean> = { A: false, B: false, C: false };
  const carried: Record<Who, number> = { A: 0, B: 0, C: 0 };

  /** The work: how many units have landed, and how many landed on top of one. */
  let ran = 0;
  let duplicates = 0;
  /** The instant the strip is still absorbing a unit, and whose it was. */
  let busyUntil = -1;
  let busyHolder: 'none' | Who = 'none';
  let firstEpochRuns = 0;

  const push = <T>(series: Series<T>[], at: number, next: T): void =>
    collapseAtInstant(series, { at: round(at), value: next }, () => 'value');

  const cue = (at: number, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    cues.push([round(at), name]);
  };

  const { schedule, drain } = createScheduler();

  // --- the ring, which is the lease drawn as time -------------------------

  let openRing: { from: number; span: number } | null = null;

  const closeRing = (until: number): void => {
    if (!openRing) return;
    const { from, span } = openRing;
    openRing = null;
    const visibleFrom = Math.max(from, 0);
    const visibleTo = Math.min(until, SCENE_DURATION);
    if (visibleTo <= visibleFrom) return;
    ring.push({
      at: round(visibleFrom),
      until: round(visibleTo),
      from: round(RING_CIRCUMFERENCE * ((visibleFrom - from) / span)),
      to: round(RING_CIRCUMFERENCE * ((visibleTo - from) / span)),
    });
    for (let tick = from + RING_CUE_EVERY; tick < until - 1e-9; tick += RING_CUE_EVERY) {
      cue(round(tick), 'state');
    }
  };

  // --- the record ---------------------------------------------------------

  const setRole = (id: Who, at: number, next: Role): void => {
    if (role[id] === next) return;
    role[id] = next;
    push(roles[id], at, next);
  };

  const expire = (at: number): void => {
    held = 'none';
    expiresAt = -1;
    generation += 1;
    push(holder, at, 'none');
    cue(at, 'trip');
  };

  /** Books the expiry this grant reaches unless a renewal gets there first. */
  const bookExpiry = (): void => {
    const mine = generation;
    const when = expiresAt;
    if (when > SCENE_DURATION) return;
    schedule(when, () => {
      if (generation !== mine) return;
      closeRing(when);
      expire(when);
    });
  };

  const startRing = (at: number): void => {
    closeRing(at);
    openRing = { from: at, span: TTL };
  };

  const grant = (id: Who, at: number): void => {
    held = id;
    grants += 1;
    carried[id] = grants;
    expiresAt = round(at + TTL);
    generation += 1;
    push(holder, at, id.toLowerCase());
    push(epoch, at, grants);
    startRing(at);
    cue(at, 'success');
    bookExpiry();
    bookRenewal(id, generation);
  };

  const renew = (id: Who, at: number): void => {
    expiresAt = round(at + TTL);
    generation += 1;
    startRing(at);
    cue(at, 'success');
    bookExpiry();
    bookRenewal(id, generation);
  };

  // --- what an instance does ----------------------------------------------

  /** A leader renews once the ring is down to its last share. */
  function bookRenewal(id: Who, mine: number): void {
    const departs = round(expiresAt - RENEW_AT * TTL);
    if (departs > SCENE_DURATION) return;
    schedule(departs, () => {
      if (generation !== mine || held !== id || !alive[id] || role[id] !== 'leader') return;
      send(id, 'renew', departs, false);
    });
  }

  /** A leader emits units of work for as long as it is still the leader. */
  function bookWork(id: Who, from: number): void {
    const step = (n: number): void => {
      const departs = round(from + JOB_DELAY + n * JOB_EVERY);
      if (departs > SCENE_DURATION) return;
      schedule(departs, () => {
        if (role[id] !== 'leader' || !alive[id] || held !== id) return;
        travellers.push({ kind: 'tick', lane: LANES[id] ?? 0, start: departs, ok: true, ringed: false });
        const lands = round(departs + TICK_LEG);
        schedule(lands, () => {
          // Two holders landing work at once is the thing that must never happen.
          if (lands < busyUntil && busyHolder !== id) {
            duplicates += 1;
            push(dup, lands, duplicates);
          }
          busyUntil = round(lands + TICK_LEG);
          busyHolder = id;
          ran += 1;
          if (grants <= 1) firstEpochRuns = ran;
          push(runs, lands, ran);
          slots.push({ at: lands, index: ran });
          if (ran % TICK_CUE_EVERY === 0) cue(lands, 'success');
        });
        step(n + 1);
      });
    };
    step(0);
  }

  /** A follower looks again on its own cadence, which is also how it takes over. */
  function bookWatch(id: Who, from: number): void {
    const step = (n: number): void => {
      const departs = round(from + (n + 1) * (WATCH[id] ?? 6));
      if (departs > SCENE_DURATION) return;
      schedule(departs, () => {
        if (role[id] !== 'follower' || !alive[id] || held === id) return;
        if (held === 'none') cue(departs, 'trip');
        send(id, 'watch', departs, held === 'none');
        step(n + 1);
      });
    };
    step(0);
  }

  const becomeLeader = (id: Who, at: number): void => {
    watching[id] = false;
    setRole(id, at, 'leader');
    cue(at, 'state');
    bookWork(id, at);
  };

  const becomeFollower = (id: Who, at: number): void => {
    if (role[id] !== 'follower') cue(at, 'state');
    setRole(id, at, 'follower');
    if (watching[id]) return;
    watching[id] = true;
    bookWatch(id, at);
  };

  /**
   * One call up the lane and one answer back down it. The store decides the
   * instant the call reaches it, so two calls that set out together are still
   * answered in the order they arrive.
   */
  function send(id: Who, kind: TravellerKind, departs: number, ringed: boolean): void {
    const arrives = round(departs + LEG);
    const lands = round(arrives + LEG);
    schedule(arrives, () => {
      const free = held === 'none';
      const mine = held === id && carried[id] === grants;
      const ok = kind === 'renew' ? mine : free;
      travellers.push({ kind, lane: LANES[id] ?? 0, start: departs, ok, ringed });
      if (ok) {
        if (kind === 'renew') {
          // Already leading: a renewal buys time, it does not start anything.
          renew(id, arrives);
          return;
        }
        grant(id, arrives);
        schedule(lands, () => becomeLeader(id, lands));
        return;
      }
      // Refused. A stale renewal is a different kind of no from a busy seat.
      cue(arrives, kind === 'renew' ? 'failure' : 'state');
      schedule(lands, () => becomeFollower(id, lands));
    });
  }

  // --- the three moments the scene is given -------------------------------

  WHO.forEach((id, index) => {
    const departs = round(BOOT + index * STAGGER);
    schedule(departs, () => send(id, 'acquire', departs, true));
  });

  schedule(CRASH, () => {
    alive.A = false;
    watching.A = false;
    setRole('A', CRASH, 'down');
    cue(CRASH, 'failure');
  });

  schedule(RESTART, () => {
    // A wakes up still holding the grant it was given before it went quiet.
    alive.A = true;
    send('A', 'renew', RESTART, true);
  });

  schedule(MARK_AT, () => {
    push(mark, MARK_AT, 'set');
    cue(MARK_AT, 'state');
  });

  schedule(PULSE_FROM, () => {
    push(pulse, PULSE_FROM, 'on');
    cue(PULSE_FROM, 'state');
  });
  schedule(PULSE_TO, () => push(pulse, PULSE_TO, 'off'));

  drain();
  // Whatever the ring was doing when the scene ran out, it keeps doing.
  closeRing(SCENE_DURATION);
  cue(FINALE_AT, 'success');
  cues.sort((left, right) => left[0] - right[0]);

  const boundary = Math.min(Math.max(firstEpochRuns, 1), RUN_SLOTS - 1);
  const marked: Series<string>[] = mark.map((entry) => ({ at: entry.at, value: String(boundary) }));

  return {
    travellers,
    holder,
    epoch,
    roles,
    runs,
    dup,
    mark: marked,
    pulse,
    slots,
    ring,
    cues,
    boundary,
  };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);
  const ringProgress = q<SVGCircleElement>(stage, '.le-ttl-progress', ID);

  const sim = simulate();
  const requests = mountRequests(requestLayer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- the readouts, straight from the simulation -------------------------

  for (const entry of sim.holder) attr(tl, stage, 'data-holder', entry.value, entry.at);
  for (const entry of sim.epoch) attr(tl, stage, 'data-epoch', String(entry.value), entry.at);
  for (const id of WHO) {
    for (const entry of sim.roles[id]) {
      attr(tl, stage, `data-${id.toLowerCase()}`, entry.value, entry.at);
    }
  }
  for (const entry of sim.runs) attr(tl, stage, 'data-runs', String(entry.value), entry.at);
  for (const entry of sim.dup) attr(tl, stage, 'data-dupes', String(entry.value), entry.at);
  for (const entry of sim.mark) attr(tl, stage, 'data-seam', entry.value, entry.at);
  for (const entry of sim.pulse) attr(tl, stage, 'data-pulse', entry.value, entry.at);

  for (const slot of sim.slots) {
    const target = stage.querySelector(`.le-slot--${slot.index}`);
    if (target) attr(tl, target, 'data-slot', 'run', slot.at);
  }

  // --- the ring, which is drawn rather than switched ----------------------

  for (const segment of sim.ring) {
    tl.fromTo(
      ringProgress,
      { attr: { 'stroke-dashoffset': segment.from } },
      {
        attr: { 'stroke-dashoffset': segment.to },
        duration: Math.max(round(segment.until - segment.at), 0.01),
        ease: 'none',
        immediateRender: false,
      },
      segment.at,
    );
  }

  // --- the travellers -----------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const parts = requests[index];
    if (!parts) return;

    if (traveller.kind === 'tick') {
      parkRequest(parts, traveller.lane, Y_WORK);
      const lands = round(traveller.start + TICK_LEG);
      showRequest(tl, parts, traveller.start);
      moveRequest(tl, parts, Y_STRIP, TICK_LEG, traveller.start);
      markRequest(tl, parts, 'ok', lands);
      hideRequest(tl, parts, lands, FADE);
      return;
    }

    parkRequest(parts, traveller.lane, Y_INST);
    const arrives = round(traveller.start + LEG);
    const lands = round(arrives + LEG);
    showRequest(tl, parts, traveller.start);
    moveRequest(tl, parts, Y_STORE, LEG, traveller.start);
    markRequest(tl, parts, traveller.ok ? 'ok' : 'fail', arrives);
    moveRequest(tl, parts, Y_INST, LEG, arrives);
    if (traveller.ringed) haloRequest(tl, parts, traveller.start, lands, FADE);
    hideRequest(tl, parts, lands, FADE);
  });

  // --- sounds and step labels ---------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // The stage is complete on the first frame: a record with nobody in it, an
  // empty ring, three instances that have not asked yet, and no work done.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
