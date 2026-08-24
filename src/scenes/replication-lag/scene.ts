import gsap from 'gsap';
import {
  LAG_MAX_MS,
  LAG_STEP_MS,
  LSN_BASE,
  METER_W,
  READ_MAX,
  SCENE_DURATION,
  STAGE_STATE,
  STALE_MAX,
  STREAM_LEN,
  X_PRIMARY,
  X_REPLICA,
  X_STREAM_FROM,
  X_TRUNK,
  Y_ARRIVE,
  Y_CLIENT,
  Y_RAIL,
  Y_STREAM,
  nameKey,
} from './stage';
import type { Name } from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
  haloRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestParts } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Replication Lag scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told five things: when
 * each write leaves the App and what it sets, when each read leaves and whether
 * it belongs to the session that just wrote, how long the replica takes to
 * apply one change over the course of the scene, when the router starts routing
 * by session, and when the primary fails.
 *
 * Everything else falls out of one pass over the whole 24 seconds. A write
 * commits when it reaches the primary, which is what moves the value and the
 * position on it. The replica applies changes one at a time, so a change that
 * arrives while the previous one is still being applied waits its turn: that
 * queue is the whole of the second step, and it is why six writes two tenths
 * apart leave the last of them two seconds behind. How long a change was in
 * flight is its lag, and the readout, the meter and the colour of the meter are
 * that number rather than three separately chosen frames. A read is answered by
 * whichever box the router sent it to, with the value that box holds at the
 * instant it arrives, so the stale reads in the second step and the correct
 * ones in the third are consequences of the queue rather than results written
 * down in advance. Promotion keeps whatever the replica had applied, which is
 * what makes the one change still on the stream the scene's RPO.
 */

const ID = 'replication-lag';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a request moves --------------------------------------------------

/**
 * One speed for every leg of every journey, in pixels per second.
 *
 * A fixed speed rather than a fixed duration per leg is what keeps requests off
 * each other: everything leaves the same point on the same trunk, so two that
 * left `d` seconds apart stay `SPEED * d` apart for as long as they share the
 * route, whichever box each is bound for.
 */
const SPEED = 3000;

const DROP_TO_RAIL = (Y_RAIL - Y_CLIENT) / SPEED;
const ACROSS = (X_TRUNK - X_PRIMARY) / SPEED;
const DROP_TO_BOX = (Y_ARRIVE - Y_RAIL) / SPEED;
/** How long a request takes from leaving the App to reaching a box. */
const TRIP = DROP_TO_RAIL + ACROSS + DROP_TO_BOX;

/** How long a box takes to answer a read once the read has reached it. */
const READ_DWELL = 0.18;
/** How long a result marker stays before the request goes. */
const FADE = 0.2;
/** How long a write is absorbed for once it has landed. */
const WRITE_FADE = 0.18;
/** How long a change that will never arrive takes to disappear. */
const LOST_FADE = 0.3;
/** How long the meter takes to move to a new reading. */
const METER_SWING = 0.25;

// --- what the scene is told -----------------------------------------------

interface WritePlan {
  /** When the write leaves the App. */
  start: number;
  /** The value it sets. A write without one changes rows nobody reads here. */
  name?: Name;
  /** True when it is the session the third step follows. */
  session?: boolean;
}

/**
 * When each write leaves the App. The six in the middle are the burst: they are
 * two tenths apart, which is closer together than the replica can apply them.
 */
const WRITES: WritePlan[] = [
  { start: 0.56, name: 'Bea' },
  { start: 6.2 },
  { start: 6.4 },
  { start: 6.6 },
  { start: 6.8 },
  { start: 7.0 },
  { start: 7.2 },
  { start: 7.66, name: 'Cy', session: true },
  { start: 12.4, name: 'Di', session: true },
  { start: 17.6 },
  { start: 18.4 },
  { start: 19.0, name: 'Ed' },
  { start: 20.4, name: 'Fay' },
];

interface ReadPlan {
  /** When the read leaves the App. */
  start: number;
  /** True when it belongs to the session that has just written. */
  session?: boolean;
  /**
   * Which way the router honours the session, once it routes by session at all:
   * send the read to the primary, or hold it until the replica has caught up.
   */
  route?: 'primary' | 'wait';
}

const READS: ReadPlan[] = [
  { start: 2.2 },
  { start: 3.0 },
  { start: 3.8 },
  { start: 4.6 },
  { start: 8.8, session: true },
  { start: 9.6, session: true },
  { start: 10.8, session: true },
  { start: 13.0, session: true, route: 'primary' },
  { start: 14.2 },
  { start: 15.4, session: true, route: 'wait' },
  { start: 21.4 },
  { start: 22.0 },
  { start: 22.6 },
];

/**
 * How long the replica takes to apply one change, from each time onwards. It is
 * the one thing about the replica the scene is told: a fifth of a second while
 * it is idle, half a second while the burst is landing on it, seconds while it
 * is still working through what the burst left, and back under a second once it
 * has recovered.
 */
const SERVICE: [number, number][] = [
  [0, 0.2],
  [6.2, 0.5],
  [11.0, 3.2],
  [17.2, 0.8],
];

/** How long the router keeps sending a session's reads to the primary. */
const SESSION_TTL = 5;
/** When the router starts routing by session at all. */
const POLICY_AT = 12;
/** When the alert mark appears on the lag meter. */
const ALERT_AT = 18.2;
/** When the primary stops answering, and when the replica takes over. */
const FAIL_AT = 19.8;
const PROMOTE_AT = 19.9;
/** When the router's own rules are rewritten for the node that survived. */
const REROUTE_AT = 20.4;

// --- what the simulation produces -----------------------------------------

interface WriteOutcome {
  commitAt: number;
  /** The box it landed on, which after promotion is the surviving one. */
  target: 'primary' | 'replica';
}

/** One change crossing the stream: when it left, when it lands, or that it does not. */
interface ChangeOutcome {
  from: number;
  /** When it stops being drawn: where it landed, or where the promotion caught it. */
  to: number;
  /** How long the whole crossing would have taken, which is the lag it carries. */
  flight: number;
  lost: boolean;
}

interface ReadOutcome {
  decideAt: number;
  /** When it leaves the rail: later than `decideAt` only when it had to wait. */
  releaseAt: number;
  target: 'primary' | 'replica';
  arriveAt: number;
  resolveAt: number;
  /** True when the value it was given had already been replaced by its own write. */
  wrong: boolean;
  /** True when it carries a session, which is what the ring marks. */
  ringed: boolean;
}

interface AttrChange {
  at: number;
  name: string;
  value: string;
}

interface Segment {
  from: number;
  to: number;
  vFrom: number;
  vTo: number;
}

interface Simulation {
  writes: WriteOutcome[];
  changes: ChangeOutcome[];
  reads: ReadOutcome[];
  attrs: AttrChange[];
  meter: Segment[];
  cues: [number, SceneCue][];
}

/** What the replica costs to apply one change at `at`. */
function serviceAt(at: number): number {
  let cost = SERVICE[0]?.[1] ?? 0.2;
  for (const [from, value] of SERVICE) if (at >= from) cost = value;
  return cost;
}

// --- the simulation -------------------------------------------------------

function simulate(): Simulation {
  const writes: WriteOutcome[] = WRITES.map(() => ({ commitAt: 0, target: 'primary' as const }));
  const changes: ChangeOutcome[] = [];
  const reads: ReadOutcome[] = READS.map(() => ({
    decideAt: 0,
    releaseAt: 0,
    target: 'replica' as const,
    arriveAt: 0,
    resolveAt: 0,
    wrong: false,
    ringed: false,
  }));

  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const meter: Segment[] = [];

  const setAttr = (at: number, name: string, value: string): void => {
    raw.push({ at: round(at), name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  // --- state the simulation carries ---------------------------------------

  /** Where the primary has got to, and what its row holds. */
  let primaryLsn = LSN_BASE;
  let primaryValue: Name = 'Ann';
  /** Where the replica has got to, and what its row holds. */
  let replicaLsn = LSN_BASE;
  let replicaValue: Name = 'Ann';
  /** When the replica finishes the change it is applying now. */
  let applyFree = 0;
  /** The session's last write: what it set, and when the replica caught up. */
  let sessionValue: Name | undefined;
  let sessionApplyAt = 0;
  let sessionCommitAt = -Infinity;
  /** How many reads have been answered, and how many with a replaced value. */
  let answered = 0;
  let staleReads = 0;
  /** What the meter is showing now, so a new reading tweens from it. */
  let meterWidth = 0;

  const showLag = (at: number, seconds: number): void => {
    const ms = Math.min(Math.round((seconds * 1000) / LAG_STEP_MS) * LAG_STEP_MS, LAG_MAX_MS);
    setAttr(at, 'data-lag', String(ms / LAG_STEP_MS));
    setAttr(at, 'data-lagstate', ms > 1000 ? 'high' : 'calm');
    const width = round((ms / LAG_MAX_MS) * METER_W);
    if (width !== meterWidth) {
      meter.push({ from: round(at), to: round(at + METER_SWING), vFrom: meterWidth, vTo: width });
      meterWidth = width;
    }
  };

  const { schedule, drain } = createScheduler();

  // --- the moments the scene is told about --------------------------------

  schedule(POLICY_AT, () => {
    setAttr(POLICY_AT, 'data-policy', 'session');
    cue(POLICY_AT, 'trip');
  });

  schedule(ALERT_AT, () => {
    setAttr(ALERT_AT, 'data-alert', 'on');
    cue(ALERT_AT, 'state');
  });

  schedule(FAIL_AT, () => {
    setAttr(FAIL_AT, 'data-primary', 'down');
    cue(FAIL_AT, 'trip');
  });

  schedule(PROMOTE_AT, () => {
    setAttr(PROMOTE_AT, 'data-replica', 'promoted');
    cue(PROMOTE_AT, 'trip');
  });

  schedule(REROUTE_AT, () => {
    setAttr(REROUTE_AT, 'data-topology', 'failover');
    cue(REROUTE_AT, 'state');
  });

  // --- the writes ---------------------------------------------------------

  WRITES.forEach((plan, index) => {
    const commitAt = round(plan.start + TRIP);
    const outcome = writes[index];
    if (!outcome) return;

    schedule(commitAt, () => {
      // After promotion the surviving node is the one a write lands on, and it
      // carries on numbering from the last position it had applied.
      const promoted = commitAt >= PROMOTE_AT;
      outcome.commitAt = commitAt;
      outcome.target = promoted ? 'replica' : 'primary';

      if (promoted) {
        replicaLsn += 1;
        setAttr(commitAt, 'data-rlsn', String(replicaLsn - LSN_BASE));
        if (plan.name) {
          replicaValue = plan.name;
          setAttr(commitAt, 'data-rval', nameKey(plan.name));
        }
        cue(commitAt, 'state');
        return;
      }

      primaryLsn += 1;
      const lsn = primaryLsn;
      setAttr(commitAt, 'data-plsn', String(lsn - LSN_BASE));
      if (plan.name) {
        primaryValue = plan.name;
        setAttr(commitAt, 'data-pval', nameKey(plan.name));
      }
      cue(commitAt, 'state');

      // The replica applies one change at a time, so a change that arrives
      // while the previous one is still being applied waits behind it.
      const applyStart = Math.max(commitAt, applyFree);
      const applyEnd = round(applyStart + serviceAt(applyStart));
      applyFree = applyEnd;
      const lost = applyEnd > PROMOTE_AT;
      changes.push({
        from: commitAt,
        to: lost ? PROMOTE_AT : applyEnd,
        flight: round(applyEnd - commitAt),
        lost,
      });

      if (plan.session) {
        sessionValue = plan.name;
        sessionApplyAt = applyEnd;
        sessionCommitAt = commitAt;
        // The chip is what the session was handed back, so it is only worth
        // drawing once there is a router that reads it.
        if (commitAt >= POLICY_AT) {
          setAttr(commitAt, 'data-session', String(lsn - LSN_BASE));
          setAttr(round(commitAt + SESSION_TTL), 'data-session', 'off');
        }
      }

      if (lost) return;

      schedule(applyEnd, () => {
        replicaLsn = lsn;
        replicaValue = plan.name ?? replicaValue;
        setAttr(applyEnd, 'data-rlsn', String(replicaLsn - LSN_BASE));
        if (plan.name) setAttr(applyEnd, 'data-rval', nameKey(plan.name));
        showLag(applyEnd, applyEnd - commitAt);
        cue(applyEnd, 'state');
      });
    });
  });

  // --- the reads ----------------------------------------------------------

  READS.forEach((plan, index) => {
    const outcome = reads[index];
    if (!outcome) return;
    // The router decides when the read reaches the rail, so a policy that is
    // not on yet is not one it can route by.
    const decideAt = round(plan.start + DROP_TO_RAIL);
    outcome.decideAt = decideAt;
    outcome.ringed = plan.session === true;

    schedule(decideAt, () => {
      const promoted = decideAt >= PROMOTE_AT;
      const bySession =
        !promoted &&
        plan.session === true &&
        decideAt >= POLICY_AT &&
        decideAt - sessionCommitAt < SESSION_TTL;

      let releaseAt = decideAt;
      let target: 'primary' | 'replica' = 'replica';
      let route = 'reads';

      if (bySession && plan.route === 'primary') {
        target = 'primary';
        route = 'session';
      } else if (bySession && plan.route === 'wait') {
        // Hold it on the rail until the replica has reached the write, then
        // send it to the replica after all.
        releaseAt = round(Math.max(decideAt, sessionApplyAt));
        route = 'wait';
      }

      outcome.releaseAt = releaseAt;
      outcome.target = target;
      const arriveAt = round(releaseAt + ACROSS + DROP_TO_BOX);
      const resolveAt = round(arriveAt + READ_DWELL);
      outcome.arriveAt = arriveAt;
      outcome.resolveAt = resolveAt;

      setAttr(decideAt, 'data-route', route);
      if (route === 'wait') setAttr(releaseAt, 'data-route', 'reads');
      setAttr(resolveAt, 'data-route', 'none');
      if (route !== 'reads') cue(decideAt, 'state');

      schedule(arriveAt, () => {
        // The box answers with what it holds at the instant the read reaches
        // it, which is what makes a read of a replica behind its primary wrong.
        const value = target === 'primary' ? primaryValue : replicaValue;
        const wrong = plan.session === true && sessionValue !== undefined && value !== sessionValue;
        outcome.wrong = wrong;

        answered += 1;
        setAttr(resolveAt, 'data-reads', String(Math.min(answered, READ_MAX)));
        if (wrong) {
          staleReads += 1;
          setAttr(resolveAt, 'data-stale', String(Math.min(staleReads, STALE_MAX)));
          // The replica says so itself while it is answering with a value its
          // primary has already replaced.
          setAttr(arriveAt, 'data-stale-mark', 'on');
          setAttr(round(resolveAt + FADE), 'data-stale-mark', 'off');
        }
        cue(resolveAt, wrong ? 'failure' : 'success');
      });
    });
  });

  drain();

  // --- the change that never lands ----------------------------------------

  if (changes.some((change) => change.lost)) setAttr(PROMOTE_AT, 'data-lost', 'on');

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => change.name);
  }

  const seen = new Map<string, string>();
  for (const [key, value] of Object.entries(STAGE_STATE)) {
    seen.set(key.replace('stage@', ''), value);
  }
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    if (seen.get(change.name) === change.value) continue;
    seen.set(change.name, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);

  return { writes, changes, reads, attrs, meter, cues };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const meterFill = q<SVGRectElement>(stage, '.rl-meter-fill', ID);
  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const parts = mountRequests(layer, READS.length + WRITES.length + sim.changes.length, ID);
  const readParts = parts.slice(0, READS.length);
  const writeParts = parts.slice(READS.length, READS.length + WRITES.length);
  const changeParts = parts.slice(READS.length + WRITES.length);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) attr(tl, stage, change.name, change.value, change.at);

  // --- the lag meter ------------------------------------------------------

  for (const segment of sim.meter) {
    if (segment.to <= segment.from || segment.vFrom === segment.vTo) continue;
    tl.fromTo(
      meterFill,
      { attr: { width: segment.vFrom } },
      {
        attr: { width: segment.vTo },
        duration: segment.to - segment.from,
        ease: 'none',
        immediateRender: false,
      },
      segment.from,
    );
  }

  // --- what travels -------------------------------------------------------

  const move = (target: RequestParts, vars: gsap.TweenVars, duration: number, at: number): void => {
    tl.to(target.group, { ...vars, duration, ease: 'none', immediateRender: false }, at);
  };

  READS.forEach((plan, index) => {
    const request = readParts[index];
    const outcome = sim.reads[index];
    if (!request || !outcome) return;

    const lane = outcome.target === 'primary' ? X_PRIMARY : X_REPLICA;
    // The legs meet at the instants the simulation rounded to, so a corner is
    // one point rather than two legs overlapping by a fraction of it.
    const turnAt = round(outcome.releaseAt + ACROSS);
    parkRequest(request, X_TRUNK, Y_CLIENT);

    showRequest(tl, request, plan.start);
    move(request, { y: Y_RAIL }, outcome.decideAt - plan.start, plan.start);
    move(request, { x: lane }, turnAt - outcome.releaseAt, outcome.releaseAt);
    move(request, { y: Y_ARRIVE }, outcome.arriveAt - turnAt, turnAt);

    // A read carrying a session is ringed from the moment the router sees it,
    // which is the only difference between it and everyone else's read.
    if (outcome.ringed) haloRequest(tl, request, outcome.decideAt, outcome.resolveAt, FADE);

    markRequest(tl, request, outcome.wrong ? 'fail' : 'ok', outcome.resolveAt);
    hideRequest(tl, request, outcome.resolveAt, FADE);
  });

  WRITES.forEach((plan, index) => {
    const request = writeParts[index];
    const outcome = sim.writes[index];
    if (!request || !outcome) return;

    const square = attachToRequest(request, 'rect', {
      class: 'scene-req-square rl-write',
      x: '-15',
      y: '-15',
      width: '30',
      height: '30',
      rx: '6',
    });
    parkRequest(request, X_TRUNK, Y_CLIENT);
    gsap.set(request.dot, { opacity: 0 });
    gsap.set(square, { opacity: 1 });

    const lane = outcome.target === 'primary' ? X_PRIMARY : X_REPLICA;
    const decideAt = round(plan.start + DROP_TO_RAIL);
    const turnAt = round(decideAt + ACROSS);
    showRequest(tl, request, plan.start);
    move(request, { y: Y_RAIL }, decideAt - plan.start, plan.start);
    move(request, { x: lane }, turnAt - decideAt, decideAt);
    move(request, { y: Y_ARRIVE }, outcome.commitAt - turnAt, turnAt);
    tl.set(square, { opacity: 0, immediateRender: false }, outcome.commitAt);
    markRequest(tl, request, 'ok', outcome.commitAt);
    hideRequest(tl, request, outcome.commitAt, WRITE_FADE);
  });

  sim.changes.forEach((change, index) => {
    const request = changeParts[index];
    if (!request) return;

    const diamond = attachToRequest(request, 'path', {
      class: `rl-change${change.lost ? ' rl-change--lost' : ''}`,
      d: 'M 0 -16 L 16 0 L 0 16 L -16 0 Z',
    });
    parkRequest(request, X_STREAM_FROM, Y_STREAM);
    gsap.set(request.dot, { opacity: 0 });
    gsap.set(diamond, { opacity: 1 });

    // A change travels for exactly as long as it is late by, so the queue on
    // the stream is the lag rather than a picture of it. One that is caught by
    // the promotion stops where it had got to.
    const travel = round(change.to - change.from);
    const reach = round(X_STREAM_FROM + (STREAM_LEN * travel) / change.flight);

    showRequest(tl, request, change.from);
    move(request, { x: reach }, travel, change.from);
    hideRequest(tl, request, change.to, change.lost ? LOST_FADE : WRITE_FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: two boxes holding the same value
  // at the same position, an empty stream between them, and a lag of nothing.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
