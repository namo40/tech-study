import gsap from 'gsap';
import {
  BASE_VERSION,
  FIRST_TOKEN,
  LOG_SLOTS,
  SCENE_DURATION,
  X_A,
  X_B,
  Y_INST,
  Y_LOCK,
  Y_STORE,
} from './stage';
import { STAGE_STATE } from './stage';
import { q } from '../shared/dom';
import { shakeService } from '../shared/effects';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Distributed Lock scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told when each instance's
 * nightly job fires, when it asks for the key, when it writes, how long it keeps
 * working, when it pauses and wakes, when it gives the key back, whether Storage
 * is checking tokens, and how fast a lock call and a write travel. Every number
 * on the stage falls out of one pass over the whole 24 seconds: no owner, token,
 * deadline, version, log cell or sound cue is written down anywhere.
 *
 * The lock row is the state of that pass: who owns the key, which token that
 * owner was handed, and when the lease runs out. A grant hands out the next
 * fence token and sets a deadline `TTL` ahead of itself; a renewal that lands
 * while its sender still owns the row pushes the deadline out again; a sender
 * that is paused cannot renew, so the deadline arrives and the row clears
 * itself without asking. The waiter's retries are a cadence, not a list, so
 * which one succeeds is decided by when the row happens to be free.
 *
 * Storage is the second half of the same pass. Every writer remembers the
 * report version it read when it took the key, and Storage compares that with
 * what it is holding: a write whose base is stale still lands, and the report
 * is `??` from then on. Once fencing is switched on Storage also remembers the
 * highest token it has seen, and a write carrying anything lower is refused
 * before it can do that.
 *
 * The lease is drawn on a 5:1 compression: ten real seconds of TTL are 2.0
 * seconds of scene time, so a whole lease fits inside a step and can still be
 * seen to drain. The row keeps saying `TTL 10 s`, because that is the number
 * the reader would configure.
 */

const ID = 'distributed-lock';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how far and how fast -------------------------------------------------

/**
 * Two speeds, in pixels per second, and they are not the same on purpose. A
 * lock call asks one small question and is answered on the connection it
 * arrived on; a write carries the report body with it and is the slower of the
 * two, which is what makes it possible to see one write overtake another.
 */
const LOCK_SPEED = 1150;
const WRITE_SPEED = 960;

const LOCK_LEG = round((Y_LOCK - Y_INST) / LOCK_SPEED);
const WRITE_LEG = round((Y_STORE - Y_INST) / WRITE_SPEED);

/** How long a traveller takes to disappear once it has been absorbed. */
const FADE = 0.15;
/** How long a write's verdict stays on the write before it dissolves. */
const WRITE_DWELL = 0.25;

// --- what a lease is ------------------------------------------------------

/**
 * The lease, in scene seconds. The row says `TTL 10 s` throughout, and ten real
 * seconds are drawn as two, so the whole of one lease is visible inside a step.
 */
const TTL = 2;
/** How long the holder waits between renewals: six real seconds, 60% of the TTL. */
const RENEW_PERIOD = 1.2;
/** How long a refused waiter waits before asking again: five real seconds. */
const RETRY_PERIOD = 1;
/** How long `expired` and `rejected` stay up once they have been said. */
const FLASH_HOLD = 0.5;
/** How long the `renew` tick stays up. */
const TICK_HOLD = 0.4;

// --- what the scene is told -----------------------------------------------

type Owner = 'a' | 'b';

/** An instance already holding the key when a step opens. */
interface HeldPlan {
  owner: Owner;
  /** When that lease was last refreshed, which is what the arc is drawn from. */
  refreshedAt: number;
}

/** One attempt to take the key. A refused one asks again on the cadence. */
interface AcquirePlan {
  owner: Owner;
  send: number;
  retry: boolean;
}

interface StepPlan {
  at: number;
  end: number;
  /** Whether Storage checks the token on a write. */
  fencing: boolean;
  /** Jobs that fire without asking anybody, which only the first step has. */
  starts?: Partial<Record<Owner, number>>;
  held?: HeldPlan;
  acquires: AcquirePlan[];
  /** When each write leaves its instance. */
  writes: { owner: Owner; send: number }[];
  /** A holder that stops answering, and when it comes back. */
  pause?: { owner: Owner; at: number; wake: number };
  /** When the holder hands the key back. */
  release?: { owner: Owner; send: number };
  /** How long each instance's job runs, which is how long it keeps renewing. */
  worksUntil: Record<Owner, number>;
}

const PLANS: StepPlan[] = [
  // The first step has no lock at all: both jobs fire, and both write.
  {
    at: 0,
    end: 6,
    fencing: false,
    starts: { a: 0.4, b: 0.5 },
    acquires: [],
    writes: [
      { owner: 'a', send: 0.9 },
      { owner: 'b', send: 1.1 },
      { owner: 'a', send: 1.5 },
      { owner: 'b', send: 1.7 },
      { owner: 'a', send: 2.1 },
      { owner: 'b', send: 2.3 },
    ],
    worksUntil: { a: 0, b: 0 },
  },
  {
    at: 6,
    end: 12,
    fencing: false,
    acquires: [
      { owner: 'a', send: 6.4, retry: false },
      { owner: 'b', send: 6.6, retry: true },
    ],
    writes: [
      { owner: 'a', send: 7.4 },
      { owner: 'a', send: 7.9 },
      { owner: 'a', send: 8.4 },
      { owner: 'b', send: 10.6 },
    ],
    release: { owner: 'a', send: 9.2 },
    worksUntil: { a: 9.6, b: 11.4 },
  },
  {
    at: 12,
    end: 18,
    fencing: false,
    held: { owner: 'a', refreshedAt: 11.4 },
    acquires: [{ owner: 'b', send: 12.3, retry: true }],
    writes: [
      { owner: 'b', send: 15.3 },
      { owner: 'a', send: 15.7 },
    ],
    pause: { owner: 'a', at: 12.7, wake: 15.6 },
    worksUntil: { a: 18, b: 17.2 },
  },
  {
    at: 18,
    end: 24,
    fencing: true,
    held: { owner: 'a', refreshedAt: 18 },
    acquires: [{ owner: 'b', send: 18.1, retry: true }],
    writes: [
      { owner: 'b', send: 21.1 },
      { owner: 'a', send: 21.4 },
      { owner: 'b', send: 22.2 },
    ],
    pause: { owner: 'a', at: 18.6, wake: 21.2 },
    release: { owner: 'b', send: 22.9 },
    worksUntil: { a: 24, b: 22 },
  },
];

/** Where the waiter already stands when a step opens holding nothing. */
const WAITING_AT_RESET: Record<number, Owner> = { 12: 'b', 18: 'b' };

// --- what the simulation produces -----------------------------------------

type Kind = 'acquire' | 'renew' | 'release' | 'write';

interface Leg {
  at: number;
  y: number;
  duration: number;
}

interface Traveller {
  kind: Kind;
  owner: Owner;
  x: number;
  startY: number;
  showAt: number;
  legs: Leg[];
  mark: [number, 'ok' | 'fail'] | null;
  fadeAt: number;
  /** The token a write carries, drawn only while Storage is checking them. */
  token: number | null;
}

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

/** One stretch of the lease arc, as the fraction of the TTL still to run. */
interface RingSegment {
  from: number;
  to: number;
  vFrom: number;
  vTo: number;
}

interface Simulation {
  travellers: Traveller[];
  attrs: AttrChange[];
  ring: RingSegment[];
  shakes: number[];
  cues: [number, SceneCue][];
}

const laneOf = (owner: Owner): number => (owner === 'a' ? X_A : X_B);

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const travellers: Traveller[] = [];
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const ring: RingSegment[] = [];
  const shakes: number[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const { schedule, drain } = createScheduler();

  // --- the state one pass carries ----------------------------------------

  /** The one row the key lives in. */
  let row: { owner: Owner; token: number; deadline: number } | null = null;
  /** The fence counter. It only ever goes up, over the whole scene. */
  let fence = FIRST_TOKEN - 1;
  /** What each instance believes it is still holding. */
  const believed: Record<Owner, number | null> = { a: null, b: null };
  /** Which instances cannot answer right now. */
  const paused: Record<Owner, boolean> = { a: false, b: false };
  /** The report Storage holds, and the version each writer based its work on. */
  let version: number = BASE_VERSION;
  let broken = false;
  const base: Record<Owner, number> = { a: BASE_VERSION, b: BASE_VERSION };
  /** The highest token Storage has seen, which outlives a step. */
  let lastToken = 0;
  let fencing = false;
  /** How many cells of the write log are used. */
  let logUsed = 0;

  /** The open stretch of the arc, closed by whatever happens to the lease next. */
  let open: { from: number; deadline: number } | null = null;

  const remainingAt = (at: number, deadline: number): number =>
    Math.max(0, Math.min(1, (deadline - at) / TTL));

  const closeRing = (at: number): void => {
    if (!open) return;
    const to = round(at);
    if (to > open.from) {
      ring.push({
        from: open.from,
        to,
        vFrom: remainingAt(open.from, open.deadline),
        vTo: remainingAt(to, open.deadline),
      });
    }
    open = null;
  };

  const openRing = (at: number, deadline: number): void => {
    closeRing(at);
    open = { from: round(at), deadline: round(deadline) };
  };

  // --- the lock row ------------------------------------------------------

  const writeRow = (at: number): void => {
    setAttr(at, 'stage', 'data-owner', row ? row.owner : 'none');
    setAttr(at, 'stage', 'data-token', row ? String(row.token) : 'none');
    setAttr(at, 'stage', 'data-ttl', row ? 'set' : 'none');
  };

  /**
   * Hands the key over. `refreshedAt` is when the lease it comes with was last
   * refreshed, which is `at` for a call that has just been answered and an
   * earlier moment for a holder that took the key before a cut.
   */
  const grant = (at: number, owner: Owner, step: StepPlan, refreshedAt = at): void => {
    fence += 1;
    const deadline = round(refreshedAt + TTL);
    row = { owner, token: fence, deadline };
    believed[owner] = fence;
    base[owner] = broken ? -1 : version;
    writeRow(at);
    setAttr(at, 'stage', 'data-lease', 'held');
    openRing(at, deadline);
    scheduleExpiry(deadline, fence, step);
  };

  const clearRow = (at: number): void => {
    row = null;
    writeRow(at);
    setAttr(at, 'stage', 'data-lease', 'none');
    closeRing(at);
  };

  const scheduleExpiry = (deadline: number, token: number, step: StepPlan): void => {
    if (deadline > step.end) return;
    schedule(deadline, () => {
      // A renewal leaves the token alone and moves the deadline, so a deadline
      // that has been pushed out is simply not this row's any more.
      if (!row || row.token !== token || row.deadline !== deadline) return;
      clearRow(deadline);
      setAttr(deadline, 'stage', 'data-expiry', 'on');
      cue(deadline, 'trip');
      const done = round(Math.min(deadline + FLASH_HOLD, step.end));
      if (done > deadline) setAttr(done, 'stage', 'data-expiry', 'off');
    });
  };

  // --- one traveller -----------------------------------------------------

  const send = (
    kind: Kind,
    owner: Owner,
    at: number,
    to: number,
    speed: number,
    token: number | null = null,
  ): Traveller => {
    const duration = round(Math.abs(to - Y_INST) / speed);
    const traveller: Traveller = {
      kind,
      owner,
      x: laneOf(owner),
      startY: Y_INST,
      showAt: round(at),
      legs: [{ at: round(at), y: to, duration }],
      mark: null,
      fadeAt: round(at + duration),
      token,
    };
    travellers.push(traveller);
    return traveller;
  };

  /** Adds the leg that carries an answered lock call back to its instance. */
  const answer = (traveller: Traveller, at: number, result: 'ok' | 'fail'): number => {
    traveller.mark = [round(at), result];
    traveller.legs.push({ at: round(at), y: Y_INST, duration: LOCK_LEG });
    const home = round(at + LOCK_LEG);
    traveller.fadeAt = home;
    return home;
  };

  // --- renewals ----------------------------------------------------------

  const scheduleRenew = (owner: Owner, departAt: number, step: StepPlan): void => {
    const depart = round(departAt);
    if (depart < step.at || round(depart + LOCK_LEG) > step.worksUntil[owner]) return;
    schedule(depart, () => {
      // A paused instance cannot send, and neither can one that no longer owns
      // the row: that is the whole of why a lease expires.
      if (paused[owner]) return;
      if (!row || row.owner !== owner) return;
      const token = row.token;
      send('renew', owner, depart, Y_LOCK, LOCK_SPEED);
      const lands = round(depart + LOCK_LEG);
      schedule(lands, () => {
        if (!row || row.token !== token) return;
        const deadline = round(lands + TTL);
        row = { ...row, deadline };
        openRing(lands, deadline);
        scheduleExpiry(deadline, token, step);
        setAttr(lands, 'stage', 'data-tick', 'on');
        const off = round(Math.min(lands + TICK_HOLD, step.end));
        if (off > lands) setAttr(off, 'stage', 'data-tick', 'off');
        cue(lands, 'state');
        scheduleRenew(owner, round(lands + RENEW_PERIOD - LOCK_LEG), step);
      });
    });
  };

  // --- one attempt to take the key ---------------------------------------

  const attempt = (plan: AcquirePlan, step: StepPlan): void => {
    const depart = round(plan.send);
    if (round(depart + LOCK_LEG) > step.end) return;
    schedule(depart, () => {
      const traveller = send('acquire', plan.owner, depart, Y_LOCK, LOCK_SPEED);
      const lands = round(depart + LOCK_LEG);
      schedule(lands, () => {
        if (row === null) {
          grant(lands, plan.owner, step);
          cue(lands, 'success');
          const home = answer(traveller, lands, 'ok');
          schedule(home, () => {
            setAttr(home, 'stage', `data-${plan.owner}`, 'running');
          });
          scheduleRenew(plan.owner, round(lands + RENEW_PERIOD - LOCK_LEG), step);
          return;
        }
        cue(lands, 'failure');
        const home = answer(traveller, lands, 'fail');
        schedule(home, () => {
          setAttr(home, 'stage', `data-${plan.owner}`, 'waiting');
          cue(home, 'state');
        });
        if (plan.retry) {
          attempt({ ...plan, send: round(depart + RETRY_PERIOD) }, step);
        }
      });
    });
  };

  // --- one write ---------------------------------------------------------

  const write = (owner: Owner, departAt: number, step: StepPlan): void => {
    const depart = round(departAt);
    schedule(depart, () => {
      const token = believed[owner];
      const traveller = send('write', owner, depart, Y_STORE, WRITE_SPEED, step.fencing ? token : null);
      const lands = round(depart + WRITE_LEG);
      schedule(lands, () => {
        // Fencing first: a token below the highest Storage has seen never gets
        // as far as touching the report.
        if (fencing && token !== null && token < lastToken) {
          traveller.mark = [lands, 'fail'];
          traveller.fadeAt = round(lands + WRITE_DWELL);
          setAttr(lands, 'stage', 'data-verdict', 'rejected');
          const off = round(Math.min(lands + FLASH_HOLD, step.end));
          if (off > lands) setAttr(off, 'stage', 'data-verdict', 'none');
          setAttr(lands, 'stage', `data-${owner}`, 'waiting');
          cue(lands, 'trip');
          return;
        }

        traveller.mark = [lands, 'ok'];
        traveller.fadeAt = round(lands + WRITE_DWELL);
        if (token !== null && token > lastToken) {
          lastToken = token;
          setAttr(lands, 'stage', 'data-last-token', String(lastToken));
        }

        // The write lands either way. Whether the report survives it depends on
        // whether the version this writer read is still the one Storage holds.
        const stale = broken || base[owner] !== version;
        const wasBroken = broken;
        if (stale) {
          broken = true;
          setAttr(lands, 'stage', 'data-value', 'broken');
          setAttr(lands, 'stage', 'data-log', 'corrupt');
          if (!wasBroken) {
            shakes.push(lands);
            cue(lands, 'failure');
          } else {
            cue(lands, 'state');
          }
        } else {
          version += 1;
          base[owner] = version;
          setAttr(lands, 'stage', 'data-value', `v${version}`);
          cue(lands, 'success');
        }

        if (logUsed < LOG_SLOTS) {
          logUsed += 1;
          setAttr(lands, `slot-${logUsed}`, 'data-slot', owner);
        }
      });
    });
  };

  // --- the steps ---------------------------------------------------------

  const reset = (step: StepPlan): void => {
    const at = step.at;
    row = null;
    broken = false;
    version = BASE_VERSION;
    logUsed = 0;
    paused.a = false;
    paused.b = false;
    believed.a = null;
    believed.b = null;
    base.a = BASE_VERSION;
    base.b = BASE_VERSION;
    // The cut ends whatever stretch of arc was running, so the segment before
    // it is written out rather than dropped.
    closeRing(at);

    writeRow(at);
    setAttr(at, 'stage', 'data-lease', 'none');
    setAttr(at, 'stage', 'data-expiry', 'off');
    setAttr(at, 'stage', 'data-tick', 'off');
    setAttr(at, 'stage', 'data-value', `v${BASE_VERSION}`);
    setAttr(at, 'stage', 'data-log', 'ok');
    setAttr(at, 'stage', 'data-verdict', 'none');
    for (let i = 1; i <= LOG_SLOTS; i += 1) setAttr(at, `slot-${i}`, 'data-slot', 'none');

    fencing = step.fencing;
    setAttr(at, 'stage', 'data-fencing', fencing ? 'on' : 'off');
    setAttr(at, 'stage', 'data-last-token', fencing && lastToken > 0 ? String(lastToken) : 'none');

    const waiter = WAITING_AT_RESET[at];
    setAttr(at, 'stage', 'data-a', waiter === 'a' ? 'waiting' : 'idle');
    setAttr(at, 'stage', 'data-b', waiter === 'b' ? 'waiting' : 'idle');

    if (step.held) {
      // The holder took the key before the cut, so it takes the next token and
      // its lease is already part way through.
      const { owner, refreshedAt } = step.held;
      fence += 1;
      const deadline = round(refreshedAt + TTL);
      row = { owner, token: fence, deadline };
      believed[owner] = fence;
      base[owner] = BASE_VERSION;
      writeRow(at);
      setAttr(at, 'stage', 'data-lease', 'held');
      openRing(at, deadline);
      scheduleExpiry(deadline, fence, step);
      setAttr(at, 'stage', `data-${owner}`, 'running');
      scheduleRenew(owner, round(refreshedAt + RENEW_PERIOD - LOCK_LEG), step);
    }
  };

  // --- the steps, one after another --------------------------------------

  for (const step of PLANS) {
    // The stage already starts in the state the first step opens on, so it is
    // the only one with nothing to clear.
    if (step.at > 0) schedule(step.at, () => reset(step));
    for (const plan of step.acquires) attempt(plan, step);
    for (const plan of step.writes) write(plan.owner, plan.send, step);

    // A job that fires on its own reads the report as it starts, and is done
    // once the last write it sent has landed.
    for (const [owner, at] of Object.entries(step.starts ?? {}) as [Owner, number][]) {
      schedule(at, () => {
        setAttr(at, 'stage', `data-${owner}`, 'running');
        base[owner] = version;
      });
      const landings = step.writes
        .filter((plan) => plan.owner === owner)
        .map((plan) => round(plan.send + WRITE_LEG));
      const done = Math.max(...landings);
      if (Number.isFinite(done)) {
        schedule(done, () => setAttr(done, 'stage', `data-${owner}`, 'idle'));
      }
    }

    if (step.pause) {
      const { owner, at, wake } = step.pause;
      schedule(at, () => {
        paused[owner] = true;
        setAttr(at, 'stage', `data-${owner}`, 'paused');
        cue(at, 'trip');
      });
      schedule(wake, () => {
        paused[owner] = false;
        setAttr(wake, 'stage', `data-${owner}`, 'running');
        cue(wake, 'trip');
      });
    }

    if (step.release) {
      const { owner, send: departAt } = step.release;
      const depart = round(departAt);
      schedule(depart, () => {
        if (!row || row.owner !== owner) return;
        send('release', owner, depart, Y_LOCK, LOCK_SPEED);
        const lands = round(depart + LOCK_LEG);
        schedule(lands, () => {
          if (!row || row.owner !== owner) return;
          clearRow(lands);
          believed[owner] = null;
          setAttr(lands, 'stage', `data-${owner}`, 'idle');
          cue(lands, 'state');
        });
      });
    }
  }

  drain();
  closeRing(SCENE_DURATION);

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}@${change.name}`);
  }

  const seen = new Map<string, string>();
  for (const [key, value] of Object.entries(STAGE_STATE)) seen.set(key, value);
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);

  return { travellers, attrs, ring, shakes, cues };
}

// --- the timeline ---------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

/** Adds one element to a traveller, styled from CSS rather than inline. */
function addPart(
  group: SVGGElement,
  tag: string,
  attributes: Record<string, string | number>,
  text?: string,
): SVGElement {
  const element = document.createElementNS(NS, tag) as SVGElement;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  if (text !== undefined) element.textContent = text;
  group.appendChild(element);
  return element;
}

/**
 * Dresses a request group as whatever it is carrying. A lock call keeps the
 * plain dot the shared runtime draws, at the size that says what kind of call
 * it is; a write is a square, because a write is the thing that changes what
 * the report says.
 */
function dressTraveller(parts: RequestParts, traveller: Traveller): SVGElement[] {
  const group = parts.group;
  group.setAttribute(
    'class',
    `scene-req dk-req dk-req--${traveller.owner} dk-req--${traveller.kind}`,
  );

  if (traveller.kind === 'renew') parts.dot.setAttribute('r', '9');
  if (traveller.kind === 'release') parts.dot.setAttribute('r', '11');
  if (traveller.kind !== 'write') return [];

  gsap.set(parts.dot, { opacity: 0 });
  const hidden: SVGElement[] = [];
  hidden.push(
    addPart(group, 'rect', {
      class: 'dk-req-write',
      x: -24,
      y: -24,
      width: 48,
      height: 48,
      rx: 12,
    }),
  );
  if (traveller.token !== null) {
    hidden.push(
      addPart(
        group,
        'text',
        { class: 'dk-req-token', x: 0, y: 9, 'text-anchor': 'middle' },
        String(traveller.token),
      ),
    );
  }
  return hidden;
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const store = q<SVGGElement>(stage, '.dk-store', ID);
  const ringProgress = q<SVGCircleElement>(stage, '.dk-ttl-progress', ID);
  const circumference = Number(ringProgress.getAttribute('stroke-dasharray') ?? 0);

  const targets: Record<string, Element> = { stage };
  for (let i = 1; i <= LOG_SLOTS; i += 1) {
    targets[`slot-${i}`] = q<SVGGElement>(stage, `.dk-slot--${i}`, ID);
  }

  const sim = simulate();
  const parts = mountRequests(layer, sim.travellers.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.target];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- the lease, drawn as an arc that drains -----------------------------

  for (const segment of sim.ring) {
    if (segment.to <= segment.from) continue;
    tl.fromTo(
      ringProgress,
      { attr: { 'stroke-dashoffset': round(circumference * (1 - segment.vFrom)) } },
      {
        attr: { 'stroke-dashoffset': round(circumference * (1 - segment.vTo)) },
        duration: round(segment.to - segment.from),
        ease: 'none',
        immediateRender: false,
      },
      segment.from,
    );
  }

  // --- what travels -------------------------------------------------------

  sim.travellers.forEach((traveller, index) => {
    const request = parts[index];
    if (!request) return;

    const hidden = dressTraveller(request, traveller);
    parkRequest(request, traveller.x, traveller.startY);
    if (traveller.kind === 'write') gsap.set(request.dot, { opacity: 0 });

    showRequest(tl, request, traveller.showAt);
    for (const leg of traveller.legs) {
      tl.to(
        request.group,
        { y: leg.y, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    if (traveller.mark) {
      markRequest(tl, request, traveller.mark[1], traveller.mark[0]);
      for (const element of hidden) {
        tl.set(element, { opacity: 0, immediateRender: false }, traveller.mark[0]);
      }
    }
    hideRequest(tl, request, traveller.fadeAt, FADE);
  });

  // --- the knock Storage makes when the report gives way ------------------

  for (const at of sim.shakes) shakeService(tl, store, at);

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: two idle instances, an empty lock
  // row, the report on the version it starts every step on, an empty write log,
  // and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
