import gsap from 'gsap';
import {
  MEMBERS,
  SCENE_DURATION,
  X_A,
  X_B,
  X_REPL_A,
  X_REPL_B,
  Y_APP,
  Y_MONITOR,
  Y_NODE,
  Y_NODE_BOTTOM,
  Y_REPL,
} from './stage';
import type { ReplDirection, Role, Target } from './stage';
import { q, qa } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  moveRequest,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Failover scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader watches is placed by hand. The scene is told nine things —
 * when the app sends a write, how long a copy waits before it leaves the
 * primary and how long it takes to cross, how often a heartbeat is sent, when A
 * stops answering, how many beats may be missed before the Monitor doubts a
 * machine and before it stops counting it, how long a vote and a promotion take,
 * when A comes back, and how fast it catches up. One pass over the whole 24
 * seconds turns that into everything else.
 *
 * Four derivations carry it. **Which machine a write goes to** is the connection
 * and nothing else, so the lane a write takes changes only because the name
 * resolved somewhere new. **Whether a write succeeds** is whether the machine it
 * reached was answering when it got there, which is why the failures in step 2
 * are not scripted: they are the same writes, sent the same way, arriving at a
 * machine that has stopped. **The lamps and the vote** come from missed beats,
 * counted against a due time rather than against a clock, so a machine is doubted
 * one beat after it goes quiet and dropped from the count one beat after that;
 * the promotion is then a fixed delay behind the vote, and the connection a fixed
 * delay behind the promotion. And **`behind`** is the ledger the whole pattern
 * turns on: it goes up when the primary commits a write and down when the copy
 * of it lands on the replica, so whatever it is holding at the instant the
 * primary dies is exactly what promotion cannot recover. That number is not
 * chosen. It is whatever the last copy had not carried, and here it is one, which
 * is why the chip that records it reads `lost 1`.
 *
 * Failover is the neighbour of Leader Election and deliberately not a repeat of
 * it. There, a lease store hands a worker role to whoever writes to it first, and
 * the loser simply does not run. Here the role is attached to data: it moves only
 * after a majority agrees the holder is gone, it drags the connection string
 * behind it, and the machine it left is not idle but stale, which is what the
 * lost-write ledger is there to say.
 */

const ID = 'failover';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

type Side = 'a' | 'b';
const SIDES: Side[] = ['a', 'b'];

/** The column a machine is reached on. */
const laneOf = (side: Side): number => (side === 'a' ? X_A : X_B);
/** The edge of a machine the replication lane leaves from. */
const replEdgeOf = (side: Side): number => (side === 'a' ? X_REPL_A : X_REPL_B);
/** The other machine, which is the only other one there is. */
const otherOf = (side: Side): Side => (side === 'a' ? 'b' : 'a');

// --- how a traveller moves -------------------------------------------------

/** Seconds a write takes between the App and a machine: 200px. */
const WRITE_LEG = 0.3;
/** Seconds a machine that is answering spends on a write. */
const DWELL = 0.12;
/** Seconds a write waits at a machine that never answers before giving up. */
const TIMEOUT = 0.35;
/** Seconds a heartbeat takes from a machine to the Monitor: 230px. */
const BEAT_LEG = 0.34;
/** Seconds a copy takes to cross between the two machines: 100px, edge to edge. */
const COPY_TRAVEL = 0.55;
/** How long each kind of traveller takes to fade once it is absorbed. */
const FADE = 0.06;
const BEAT_FADE = 0.08;
const COPY_FADE = 0.08;

/** Departure to gone, which is what a window has to hold. */
const BEAT_LIFE = BEAT_LEG + BEAT_FADE;

// --- what the scene is told ------------------------------------------------

/** When the app sends a write. Everything about it after that is derived. */
const WRITE_STARTS = [0.5, 2.1, 3.7, 6.05, 8.35, 9.55, 14.4, 16.2, 21.3];

/** How long a committed write waits before its copy leaves the primary. */
const COPY_DEPART = 0.6;

/** The heartbeat: one beat per machine, on a cadence that never changes. */
const BEAT_PHASE = 0.8;
const BEAT_CADENCE = 2;

/**
 * When beats may leave. Each step ends on a still stage, so a beat is only sent
 * when the whole of its flight fits inside the step it belongs to.
 */
const WINDOWS = [
  { from: 0.4, clearBy: 5.4 },
  { from: 6, clearBy: 11.5 },
  { from: 12, clearBy: 17.5 },
  { from: 18, clearBy: 22.9 },
];

/** When A stops answering, and when it is started again. */
const CRASH_AT = 6.9;
const RESTART_AT = 18.5;

/**
 * How the Monitor reads silence. A beat is due on the cadence; `GRACE` is how
 * long past due it waits before it acts, `MISS_DOUBT` is how many due beats a
 * machine may miss before the Monitor stops trusting it, and `MISS_OUT` is how
 * many before it stops counting it at all. The gap between the two is the whole
 * of the false-positive argument: a slow machine is doubted long before it is
 * dropped, and only a machine that is dropped can be replaced.
 */
const GRACE = 0.4;
const MISS_DOUBT = 1;
const MISS_OUT = 2;

/** How long the members take to vote, to promote, and to move the connection. */
const VOTE_DELAY = 1.3;
const PROMOTE_DELAY = 0.7;
const SWITCH_DELAY = 0.6;

/** How long after the new primary's first write is acknowledged the old tail is
    written off. Until then it is merely late; after it, it is gone. */
const LOST_DELAY = 0.08;

/** When a returning replica starts catching up, and how fast it does. */
const CATCHUP_FROM = 19.6;
const CATCHUP_PACE = 1;

/** How close two samples of one repeating thing may sound, how close any sample
    may fall to another cue, and how close any of it may fall to a boundary. */
const SAMPLE_GAP = 1.9;
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

// --- what one pass over the scene produces --------------------------------

interface WritePlan {
  lane: number;
  start: number;
  arrive: number;
  turn: number;
  home: number;
  result: RequestResult;
}

interface BeatPlan {
  lane: number;
  start: number;
  land: number;
}

interface CopyPlan {
  from: number;
  to: number;
  start: number;
  land: number;
}

interface Series<T> {
  at: number;
  value: T;
}

/** A cue that has to sound, and the family it belongs to for spacing. */
interface Fixed {
  at: number;
  family: string | null;
  name: SceneCue;
}

/** One of a repeating family, kept only if it is far enough from everything. */
interface Candidate {
  at: number;
  family: string;
  name: SceneCue;
}

interface Simulation {
  writes: WritePlan[];
  beats: BeatPlan[];
  copies: CopyPlan[];
  flags: Record<string, Series<string>[]>;
  lamps: Record<Side, Series<string>[]>;
  cues: [number, SceneCue][];
  /** Reported rather than drawn. */
  committed: number;
  failed: number;
  copied: number;
  lostWrites: number;
  promotedAt: number | null;
}

/**
 * Walks the whole scene in time order.
 *
 * Writes are booked first and everything else falls out of them, because the
 * only thing the reader is being asked to watch is which machine is answering.
 */
function simulate(): Simulation {
  const writes: WritePlan[] = [];
  const beats: BeatPlan[] = [];
  const copies: CopyPlan[] = [];
  const flags: Record<string, Series<string>[]> = {
    target: [],
    a: [],
    b: [],
    votes: [],
    behind: [],
    lost: [],
    repl: [],
  };
  const lamps: Record<Side, Series<string>[]> = { a: [], b: [] };
  const fixed: Fixed[] = [];
  const candidates: Candidate[] = [];

  const alive: Record<Side, boolean> = { a: true, b: true };
  const counted: Record<Side, boolean> = { a: true, b: true };
  const misses: Record<Side, number> = { a: 0, b: 0 };
  const owed: Record<Side, number> = { a: 0, b: 0 };
  let primary: Side = 'a';
  let target: Target = 'a';
  let behind = 0;
  let promotedAt: number | null = null;
  let lostDeclared = false;
  let resumed = false;
  let rejoinedAt: number | null = null;
  let settled = false;

  let committed = 0;
  let failed = 0;
  let copied = 0;
  let lostWrites = 0;

  const push = (series: Series<string>[], at: number, value: string): void => {
    const last = series[series.length - 1];
    if (last && last.value === value && last.at <= round(at)) return;
    collapseAtInstant(series, { at: round(at), value }, () => 'value');
  };

  const fix = (at: number, name: SceneCue, family: string | null = null): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    fixed.push({ at: round(at), family, name });
  };

  const sample = (at: number, family: string, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    candidates.push({ at: round(at), family, name });
  };

  /** Copies flow from the primary to the replica, and only while both stand. */
  const replValue = (): ReplDirection =>
    !alive.a || !alive.b ? 'none' : primary === 'a' ? 'ab' : 'ba';

  const writeRepl = (at: number): void => push(flags.repl, at, replValue());

  /**
   * How many members the Monitor can still count. The Monitor itself is one of
   * them and never drops out, so the readout is the machines it can still hear
   * plus itself, and a majority of three is two.
   */
  const writeVotes = (at: number): void => {
    const heard = SIDES.filter((side) => counted[side]).length;
    push(flags.votes, at, String(heard + (MEMBERS - SIDES.length)));
  };

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  push(flags.target, 0, target);
  push(flags.a, 0, 'primary' satisfies Role);
  push(flags.b, 0, 'replica' satisfies Role);
  push(flags.behind, 0, '0');
  push(flags.lost, 0, 'off');
  push(flags.repl, 0, replValue());
  writeVotes(0);
  for (const side of SIDES) push(lamps[side], 0, 'up');

  // --- the machine that stops ---------------------------------------------

  schedule(CRASH_AT, () => {
    alive.a = false;
    push(flags.a, CRASH_AT, 'down' satisfies Role);
    writeRepl(CRASH_AT);
    fix(CRASH_AT, 'failure');
  });

  schedule(RESTART_AT, () => {
    alive.a = true;
    // The role has moved on, so the machine that comes back is a follower.
    push(flags.a, RESTART_AT, 'replica' satisfies Role);
    writeRepl(RESTART_AT);
    fix(RESTART_AT, 'state');

    // Everything the new primary took while this one was away has to cross now.
    const backlog = owed.a;
    owed.a = 0;
    for (let n = 0; n < backlog; n += 1) {
      const start = round(CATCHUP_FROM + n * CATCHUP_PACE);
      const land = round(start + COPY_TRAVEL);
      const last = n === backlog - 1;
      schedule(start, () => {
        copies.push({ from: replEdgeOf(primary), to: replEdgeOf('a'), start, land });
        copied += 1;
        schedule(land, () => {
          if (!last) {
            sample(land, 'copy', 'success');
            return;
          }
          rejoinedAt = land;
          fix(land, 'success', 'copy');
        });
      });
    }
  });

  // --- the heartbeat, and what the Monitor makes of it ---------------------

  for (let n = 0; ; n += 1) {
    const at = round(BEAT_PHASE + n * BEAT_CADENCE);
    if (at > SCENE_DURATION) break;
    const open = WINDOWS.some((window) => at >= window.from && at + BEAT_LIFE <= window.clearBy);
    if (!open) continue;

    schedule(at, () => {
      for (const side of SIDES) {
        if (!alive[side]) {
          misses[side] += 1;
          const settleAt = round(at + GRACE);
          if (misses[side] === MISS_DOUBT) {
            schedule(settleAt, () => {
              push(lamps[side], settleAt, 'recovering');
              fix(settleAt, 'state');
            });
          }
          if (misses[side] === MISS_OUT) {
            schedule(settleAt, () => {
              push(lamps[side], settleAt, 'down');
              fix(settleAt, 'state');
              scheduleVote(settleAt);
            });
          }
          continue;
        }

        misses[side] = 0;
        const land = round(at + BEAT_LEG);
        beats.push({ lane: laneOf(side), start: at, land });
        schedule(land, () => {
          const lamp = lamps[side][lamps[side].length - 1]?.value;
          if (lamp === 'up') {
            sample(land, 'beat', 'state');
            return;
          }
          // A beat from a machine the Monitor had stopped counting puts it back.
          push(lamps[side], land, 'up');
          counted[side] = true;
          writeVotes(land);
          fix(land, 'state', 'beat');
        });
      }
    });
  }

  /** The members meet, agree the silence is real, and recount themselves. */
  function scheduleVote(from: number): void {
    const voteAt = round(from + VOTE_DELAY);
    schedule(voteAt, () => {
      for (const side of SIDES) if (!alive[side]) counted[side] = false;
      writeVotes(voteAt);
      fix(voteAt, 'trip');
      schedulePromotion(voteAt);
    });
  }

  /** A majority stands, so the seat is filled from whoever is still counted. */
  function schedulePromotion(from: number): void {
    const at = round(from + PROMOTE_DELAY);
    schedule(at, () => {
      const heir = SIDES.find((side) => counted[side] && side !== primary);
      if (!heir) return;
      primary = heir;
      promotedAt = at;
      push(flags[heir], at, 'primary' satisfies Role);
      writeRepl(at);
      fix(at, 'trip');

      const switchAt = round(at + SWITCH_DELAY);
      schedule(switchAt, () => {
        target = heir;
        push(flags.target, switchAt, heir);
        fix(switchAt, 'state');
      });
    });
  }

  // --- the writes ----------------------------------------------------------

  for (const start of WRITE_STARTS) {
    schedule(start, () => {
      const side = target;
      const lane = laneOf(side);
      const arrive = round(start + WRITE_LEG);
      schedule(arrive, () => {
        const answering = alive[side];
        const turn = round(arrive + (answering ? DWELL : TIMEOUT));
        const home = round(turn + WRITE_LEG);
        writes.push({ lane, start, arrive, turn, home, result: answering ? 'ok' : 'fail' });

        if (!answering) {
          failed += 1;
          fix(turn, 'failure');
          return;
        }

        committed += 1;
        const replica = otherOf(side);
        // The replica has one more write to receive than it holds. On B that is
        // written on the stage; on A it is only counted, because the chip that
        // reports it belongs to the machine the scene opens with as the replica.
        if (replica === 'b') {
          behind += 1;
          push(flags.behind, arrive, String(behind));
        }
        if (!alive[replica]) owed[replica] += 1;

        if (promotedAt !== null && !resumed) {
          resumed = true;
          fix(arrive, 'success', 'write');
          // The old tail cannot be reconciled once the new primary has answered
          // the app: what the replica never received is now simply missing.
          const lostAt = round(home + LOST_DELAY);
          schedule(lostAt, () => {
            if (lostDeclared || behind === 0) return;
            lostDeclared = true;
            lostWrites = behind;
            behind = 0;
            push(flags.behind, lostAt, '0');
            push(flags.lost, lostAt, 'on');
            fix(lostAt, 'state');
          });
        } else {
          sample(arrive, 'write', 'success');
        }

        const leaves = round(arrive + COPY_DEPART);
        schedule(leaves, () => {
          if (!alive[side] || !alive[replica] || primary !== side) return;
          const land = round(leaves + COPY_TRAVEL);
          copies.push({ from: replEdgeOf(side), to: replEdgeOf(replica), start: leaves, land });
          copied += 1;
          schedule(land, () => {
            if (replica === 'b') {
              behind -= 1;
              push(flags.behind, land, String(behind));
            }
            // The first copy to cross after the pair is whole again is the scene
            // settling: the roles have swapped and the link is working the other
            // way round.
            if (rejoinedAt !== null && !settled) {
              settled = true;
              fix(land, 'success', 'copy');
              return;
            }
            sample(land, 'copy', 'success');
          });
        });
      });
    });
  }

  drain();

  // --- the cues ------------------------------------------------------------

  const accepted: Fixed[] = fixed.slice().sort((left, right) => left.at - right.at);
  const lastOf: Record<string, number> = { write: -99, copy: -99, beat: -99 };
  candidates.sort((left, right) => left.at - right.at);
  for (const candidate of candidates) {
    let previous = lastOf[candidate.family] ?? -99;
    for (const other of accepted) {
      if (other.family === candidate.family && other.at < candidate.at && other.at > previous) {
        previous = other.at;
      }
    }
    if (candidate.at - previous < SAMPLE_GAP) continue;
    if (BOUNDARIES.some((edge) => Math.abs(candidate.at - edge) < BOUNDARY_GAP)) continue;
    if (accepted.some((other) => Math.abs(other.at - candidate.at) < MIN_CUE_GAP)) continue;
    lastOf[candidate.family] = candidate.at;
    accepted.push({ at: candidate.at, family: candidate.family, name: candidate.name });
    accepted.sort((left, right) => left.at - right.at);
  }

  const cues: [number, SceneCue][] = accepted
    .map((entry) => [entry.at, entry.name] as [number, SceneCue])
    .sort((left, right) => left[0] - right[0]);

  return {
    writes,
    beats,
    copies,
    flags,
    lamps,
    cues,
    committed,
    failed,
    copied,
    lostWrites,
    promotedAt,
  };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const total = sim.writes.length + sim.beats.length + sim.copies.length;
  const parts = mountRequests(layer, total, ID);
  const writeParts = parts.slice(0, sim.writes.length);
  const beatParts = parts.slice(sim.writes.length, sim.writes.length + sim.beats.length);
  const copyParts = parts.slice(sim.writes.length + sim.beats.length);

  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-${name}`, entry.value, entry.at);
  }
  for (const side of SIDES) {
    const lamp = qa(stage, `.fo-lamp-${side}, .fo-lamp-${side}-ring`);
    for (const entry of sim.lamps[side]) {
      attr(tl, lamp, 'data-health-state', entry.value, entry.at);
    }
  }

  // --- what travels --------------------------------------------------------

  // A write is a square, so it is never mistaken for the copy of itself.
  sim.writes.forEach((plan, index) => {
    const request = writeParts[index];
    if (!request) return;
    const square = attachToRequest(request, 'rect', {
      class: 'scene-req-square fo-write',
      x: '-15',
      y: '-15',
      width: '30',
      height: '30',
      rx: '6',
    });
    parkRequest(request, plan.lane, Y_APP);
    gsap.set(request.dot, { opacity: 0 });
    gsap.set(square, { opacity: 1 });

    showRequest(tl, request, plan.start);
    moveRequest(tl, request, Y_NODE, WRITE_LEG, plan.start);
    tl.set(square, { opacity: 0, immediateRender: false }, plan.turn);
    markRequest(tl, request, plan.result, plan.turn);
    moveRequest(tl, request, Y_APP, WRITE_LEG, plan.turn);
    hideRequest(tl, request, plan.home, FADE);
  });

  // A heartbeat is a small dot that is absorbed rather than answered: it says
  // one thing, once, and the Monitor either gets it or does not.
  sim.beats.forEach((plan, index) => {
    const request = beatParts[index];
    if (!request) return;
    const pulse = attachToRequest(request, 'circle', {
      class: 'fo-beat',
      r: '9',
      cx: '0',
      cy: '0',
    });
    parkRequest(request, plan.lane, Y_NODE_BOTTOM);
    gsap.set(request.dot, { opacity: 0 });
    gsap.set(pulse, { opacity: 1 });

    showRequest(tl, request, plan.start);
    moveRequest(tl, request, Y_MONITOR, BEAT_LEG, plan.start);
    hideRequest(tl, request, plan.land, BEAT_FADE);
  });

  // A copy is a diamond crossing the only horizontal lane on the stage, and the
  // direction it crosses in is the answer to which machine is the primary.
  sim.copies.forEach((plan, index) => {
    const request = copyParts[index];
    if (!request) return;
    const diamond = attachToRequest(request, 'path', {
      class: 'fo-copy',
      d: 'M 0 -16 L 16 0 L 0 16 L -16 0 Z',
    });
    parkRequest(request, plan.from, Y_REPL);
    gsap.set(request.dot, { opacity: 0 });
    gsap.set(diamond, { opacity: 1 });

    showRequest(tl, request, plan.start);
    tl.to(
      request.group,
      { x: plan.to, duration: COPY_TRAVEL, ease: 'none', immediateRender: false },
      plan.start,
    );
    hideRequest(tl, request, plan.land, COPY_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: a connection pointing at A, one
  // primary and one replica with nothing owed between them, two lamps lit, a
  // full count, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
