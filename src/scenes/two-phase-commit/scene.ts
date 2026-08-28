import {
  SCENE_DURATION,
  STORES,
  VOTE_TARGET,
  X_ORDERS,
  X_PAYMENTS,
  Y_COORD_BOTTOM,
  Y_STORE_TOP,
} from './stage';
import type { AppState, Badge, CoordState, Ghost, Lock, Mark, Phase, StoreKey } from './stage';
import { q } from '../shared/dom';
import {
  hideRequest,
  markRequest,
  moveRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestResult } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Two-Phase Commit scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told six things — when
 * each of three transactions opens, how long each store takes to make up its
 * mind, what each store answers, how long the coordinator holds the votes
 * before it writes a decision, when the coordinator dies and when it comes
 * back, and how long a leg of a lane takes. One pass over the whole 24 seconds
 * turns that into everything else: which phase the coordinator is in, how many
 * votes are in, where each store stands, which store is holding a lock, what
 * the App is told, and — the one that matters — the length of the in-doubt
 * window, which nothing in this file states.
 *
 * Three derivations carry the argument. **A decision needs every vote.** The
 * coordinator commits only when `votes` reaches two and aborts the moment a
 * single `no` arrives; both branches run through the same `decide`, so the
 * abort path is not a second story told the other way round, it is the same
 * machinery answering differently. **Prepared means locked.** A store that
 * votes yes takes a lock in the same breath and cannot put it down until a
 * decision reaches it, which is why `lock` and the `prepared` badge are written
 * together and cleared together, and why the invariant at the bottom of
 * `simulate` can assert that no store ever holds one without the other.
 * **The wait is not authored.** The coordinator writes `commit` on its phase
 * plate — that plate is the log — and the broadcast is booked for four tenths
 * later. The crash lands in between, so the broadcast finds nobody to send it
 * and is deferred until the coordinator is back. Move the crash a quarter of a
 * second later and the message goes out, the stores commit on time, and step
 * four has nothing to say; the in-doubt window is what falls out of the crash
 * landing inside that gap, not something this file draws.
 *
 * Two-Phase Commit is the neighbour of Saga and is deliberately not it. A saga
 * commits each local transaction as it goes and undoes the finished ones with
 * compensations when a later step fails: nothing is ever held, and there is a
 * window in which the world is half-changed on purpose. This protocol refuses
 * that window. Every store promises first and holds its lock while it promises,
 * and only when the last promise is in does anyone write anything — which buys
 * an atomicity a saga cannot offer, at a price a saga does not pay. The fourth
 * step is that price, and it is the reason the two patterns both exist.
 *
 * One thing is a picture rather than a measurement. The half-state in the first
 * step is drawn as a ghost over the badges rather than as badges, so the two
 * stores never actually contradict each other at any instant of the scene: what
 * step one shows is the world this protocol exists to rule out, and drawing it
 * as a real state would have made the diagram tell the lie it is warning about.
 */

const ID = 'two-phase-commit';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** One leg of a lane: 200px between the Coordinator and a store, either way. */
const LEG = 0.24;

/** How long a traveller takes to fade once it is absorbed. */
const FADE = 0.12;
/** The same, for a vote, which is carrying a verdict it has to show first. */
const VOTE_FADE = 0.16;

// --- what the scene is told ------------------------------------------------

/** What one store answers when it is asked to prepare. */
type Answer = 'yes' | 'no';

interface TransactionPlan {
  /** When the coordinator opens the transaction and the prepare phase begins. */
  at: number;
  /** How long each store takes to make up its mind, in store order. */
  validate: [number, number];
  /** What each store answers, in store order. */
  answer: [Answer, Answer];
  /**
   * How long the coordinator holds the votes before it writes a decision. The
   * first transaction holds them across a step boundary on purpose: that pause
   * is the whole of "everyone has promised and nothing is committed".
   */
  decideLag: number;
}

/**
 * The three transactions the scene runs. The first commits, the second is
 * refused by one store, and the third is the one the coordinator dies in the
 * middle of. Nothing else about them is stated: the phases, the votes, the
 * badges, the locks, the outcome and the length of the wait all fall out.
 */
const TRANSACTIONS: TransactionPlan[] = [
  { at: 6.5, validate: [0.68, 1.98], answer: ['yes', 'yes'], decideLag: 3.14 },
  { at: 14.0, validate: [0.3, 0.8], answer: ['yes', 'no'], decideLag: 0.16 },
  { at: 18.32, validate: [0.2, 0.4], answer: ['yes', 'yes'], decideLag: 0.2 },
];

/** How long after a phase change the coordinator's instruction leaves. */
const PHASE_LEAD = 0.4;
/** How long a store takes to carry out the decision once it arrives. */
const APPLY = 0.4;
/** How long after the App is told the coordinator closes the transaction. */
const CLOSE_LAG = 0.36;

/** When the coordinator process dies, and when it is brought back. */
const CRASH_AT = 20;
const RECOVER_AT = 21.8;
/** How long a recovered coordinator takes to send its logged decision again. */
const RESEND_LAG = 0.4;

/** How the wait is sampled while it lasts: when it starts, how often, how long. */
const INDOUBT_LEAD = 0.3;
const INDOUBT_PACE = 1;
const INDOUBT_HOLD = 0.6;
/** How far before the recovery the last sample lets go. */
const INDOUBT_TAIL = 0.1;

// --- the first step, which runs no transaction at all ----------------------

/** When the App shows that the request it already sent is still unanswered. */
const APP_WAITS_AT = 0.6;
/** When each half of the world that commits separately appears, and clears. */
const GHOST_AT: Record<StoreKey, number> = { orders: 1.2, payments: 1.8 };
/** What each store would show in that world, which is the contradiction. */
const GHOST_SHOWS: Record<StoreKey, Ghost> = { orders: 'committed', payments: 'aborted' };
/** When the contradiction is held up, and when the whole demonstration ends. */
const GHOST_MARK_AT = 2.6;
const GHOST_CLEAR_AT = 3.6;
/** When the answer to it is offered: all four are about to act as one. */
const ATOMIC_AT = 4.2;
const ATOMIC_HOLD = 1;

// --- beats that hold up something already derived -------------------------

/** How long after the last vote lands the promise is held up. */
const PROMISE_LAG = 0.84;
/** How long after an outcome the two agreeing answers are held up. */
const CONTRAST_LAG = 0.32;
/** How long either of those is held. */
const HOLD_FOR = 0.8;
const CONTRAST_FOR = 0.6;

/** How close any cue may fall to another, and to a step boundary. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- what one pass over the scene produces --------------------------------

interface Series {
  at: number;
  value: string;
}

/** Which way a traveller is going, which is also what it is carrying. */
type Direction = 'down' | 'up';

interface Traveller {
  lane: StoreKey;
  dir: Direction;
  /** When it leaves its origin. */
  start: number;
  /** When it is absorbed at the far end. */
  land: number;
  /** The verdict a vote shows the whole way up, or null for an instruction. */
  mark: RequestResult | null;
}

/** The three things one store says about itself, each as its own series. */
interface StoreSeries {
  badge: Series[];
  lock: Series[];
  ghost: Series[];
}

interface Simulation {
  flags: Record<string, Series[]>;
  stores: Record<StoreKey, StoreSeries>;
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the schedule fails loudly. */
  outcomes: Phase[];
  waitFor: number;
}

// --- the simulation --------------------------------------------------------

/**
 * Walks the whole scene in time order.
 *
 * The coordinator is written as a protocol rather than as a script: `open`
 * begins a transaction and broadcasts `prepare`, each store answers on its own
 * clock, `countVote` decides as soon as it can decide, and `broadcast` carries
 * whatever `decide` wrote down. Booked events run earliest first and a running
 * one may book more, so the deferred broadcast at 21.8 is sent by the same code
 * that would have sent it at 20.2.
 *
 * The crash is the one event that reaches in from outside the protocol. It does
 * not cancel anything: it flips a flag, and `aliveAt` turns that flag into
 * every consequence. A broadcast that finds no coordinator is held rather than
 * lost, because the decision was written down before the process died; the
 * stores are not told anything, because there is nobody to tell them; and they
 * stay `prepared` holding their locks, because a store that let go of a promise
 * on its own would be the one thing this protocol exists to prevent.
 */
function simulate(): Simulation {
  interface Entry {
    key: string;
    at: number;
    value: string;
    order: number;
  }

  const raw: Entry[] = [];
  let order = 0;
  const record = (key: string, at: number, value: string): void => {
    order += 1;
    raw.push({ key, at: round(at), value, order });
  };

  const travellers: Traveller[] = [];
  const wanted: { at: number; name: SceneCue }[] = [];
  const cue = (at: number, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    wanted.push({ at: round(at), name });
  };

  const setBadge = (at: number, key: StoreKey, value: Badge): void =>
    record(`badge-${key}`, at, value);
  const setLock = (at: number, key: StoreKey, value: Lock): void => record(`lock-${key}`, at, value);
  const setGhost = (at: number, key: StoreKey, value: Ghost): void =>
    record(`ghost-${key}`, at, value);

  const { schedule, drain } = createScheduler();

  // --- what the diagram is holding ----------------------------------------

  /** Whether the coordinator exists at a given moment, which is all the crash is. */
  const aliveAt = (at: number): boolean => at < CRASH_AT || at >= RECOVER_AT;

  /** Where each store stands, which nothing but a decision may move off `prepared`. */
  const badges: Record<StoreKey, Badge> = { orders: 'idle', payments: 'idle' };
  /** The decision the coordinator has written on its plate, which is its log. */
  let logged: Phase = 'idle';
  /** How many yes votes are in, and whether a no has arrived. */
  let votes = 0;
  let refused = false;
  /** Whether the decision for the open transaction has already been written. */
  let decided = false;
  /** How many stores have carried the current decision out. */
  let applied = 0;
  /** What each transaction ended as, read back by the build. */
  const outcomes: Phase[] = [];
  /** When a held broadcast was finally sent, so the wait can be measured. */
  let heldFrom: number | null = null;
  let waitFor = 0;

  // --- the opening state, which is the whole diagram -----------------------

  record('phase', 0, 'idle' satisfies Phase);
  record('votes', 0, '0');
  record('coord', 0, 'up' satisfies CoordState);
  record('app', 0, 'idle' satisfies AppState);
  record('mark', 0, 'off' satisfies Mark);
  record('settled', 0, 'off');
  for (const key of STORES) {
    setBadge(0, key, 'idle');
    setLock(0, key, 'off');
    setGhost(0, key, 'off');
  }

  // --- the lanes ------------------------------------------------------------

  /** Puts one traveller on one lane and returns when it is absorbed. */
  const send = (lane: StoreKey, dir: Direction, start: number, mark: RequestResult | null): number => {
    const land = round(start + LEG);
    travellers.push({ lane, dir, start: round(start), land, mark });
    return land;
  };

  // --- the protocol ---------------------------------------------------------

  /**
   * Sends whatever the coordinator has written down to every store, and books
   * what each of them does about it. A broadcast that finds no coordinator is
   * not lost: the decision is on the plate, so it is held and sent again by the
   * same call once the process is back.
   */
  const broadcast = (at: number, phase: Phase): void => {
    if (!aliveAt(at)) {
      if (heldFrom === null) heldFrom = round(at);
      const again = round(RECOVER_AT + RESEND_LAG);
      schedule(again, () => broadcast(again, phase));
      return;
    }
    if (heldFrom !== null) {
      waitFor = round(at - heldFrom);
      heldFrom = null;
    }
    cue(at, 'state');
    for (const key of STORES) {
      const lands = send(key, 'down', at, null);
      schedule(lands, () => arrive(key, lands, phase));
    }
  };

  /** What one store does with the instruction that has just reached it. */
  const arrive = (key: StoreKey, at: number, phase: Phase): void => {
    if (phase === 'prepare') {
      const plan = TRANSACTIONS[outcomes.length];
      const index = STORES.indexOf(key);
      const wait = plan?.validate[index];
      const answer = plan?.answer[index];
      if (wait === undefined || answer === undefined) {
        throw new Error(`${ID} scene: store ${key} was asked to prepare with no plan`);
      }
      const decided = round(at + wait);
      schedule(decided, () => {
        // A yes is a promise, and a promise is a lock. The two are written in
        // the same breath here because nothing may ever hold one without the
        // other, which is the invariant the whole protocol rests on.
        if (answer === 'yes') {
          badges[key] = 'prepared';
          setBadge(decided, key, 'prepared');
          setLock(decided, key, 'on');
          cue(decided, 'state');
        } else {
          // A store that refuses has taken nothing and is holding nothing, so
          // there is no state of its own to change: what it has is an answer.
          cue(decided, 'failure');
        }
        const home = send(key, 'up', decided, answer === 'yes' ? 'ok' : 'fail');
        schedule(home, () => countVote(home, answer));
      });
      return;
    }

    // A decision. Both stores were sent one at the same instant, so they carry
    // it out at the same instant: that simultaneity is the whole claim.
    const done = round(at + APPLY);
    schedule(done, () => {
      const settledAs: Badge = phase === 'commit' ? 'committed' : 'aborted';
      badges[key] = settledAs;
      setBadge(done, key, settledAs);
      setLock(done, key, 'off');
      applied += 1;
      if (applied < STORES.length) return;
      finish(done, phase);
    });
  };

  /** Counts one vote, and decides the moment the answer cannot change. */
  const countVote = (at: number, answer: Answer): void => {
    if (!aliveAt(at)) {
      throw new Error(`${ID} scene: a vote reached a coordinator that was not there at ${at}`);
    }
    if (answer === 'yes') {
      votes += 1;
      record('votes', at, String(votes));
      cue(at, votes === VOTE_TARGET ? 'success' : 'state');
    } else {
      refused = true;
    }
    // One no is enough, and it is enough immediately: there is no answer the
    // remaining stores could give that would change what happens next.
    if (!refused && votes < VOTE_TARGET) return;
    // A late yes for a transaction already refused changes nothing: the answer
    // is written once, and the votes that follow it are only counted.
    if (decided) return;
    decided = true;

    const plan = TRANSACTIONS[outcomes.length];
    if (!plan) throw new Error(`${ID} scene: a vote arrived with no transaction open`);
    const decideAt = round(at + plan.decideLag);
    schedule(decideAt, () => decide(decideAt));
  };

  /** Writes the decision down, and books the broadcast of it. */
  const decide = (at: number): void => {
    logged = refused ? 'abort' : 'commit';
    record('phase', at, logged);
    cue(at, 'trip');
    const sendAt = round(at + PHASE_LEAD);
    schedule(sendAt, () => broadcast(sendAt, logged));
  };

  /** Tells the App, closes the transaction, and holds up what it proved. */
  const finish = (at: number, phase: Phase): void => {
    const answer: AppState = phase === 'commit' ? 'ok' : 'fail';
    record('app', at, answer);
    cue(at, phase === 'commit' ? 'success' : 'state');
    outcomes.push(phase);

    if (outcomes.length === TRANSACTIONS.length) record('settled', at, 'on');

    // The second transaction is the one worth holding up, because it is the one
    // whose answer is a failure: both stores say the same thing, and the App is
    // told something true rather than something convenient.
    if (phase === 'abort') {
      const markAt = round(at + CONTRAST_LAG);
      schedule(markAt, () => {
        record('mark', markAt, 'contrast' satisfies Mark);
        cue(markAt, 'state');
      });
      const dropAt = round(markAt + CONTRAST_FOR);
      schedule(dropAt, () => record('mark', dropAt, 'off' satisfies Mark));
    }

    const closeAt = round(at + CLOSE_LAG);
    schedule(closeAt, () => {
      logged = 'idle';
      votes = 0;
      refused = false;
      decided = false;
      applied = 0;
      record('phase', closeAt, 'idle' satisfies Phase);
      record('votes', closeAt, '0');
    });
  };

  /** Opens a transaction: a phase, a clean slate, and one instruction. */
  const open = (plan: TransactionPlan, index: number): void => {
    schedule(plan.at, () => {
      record('phase', plan.at, 'prepare' satisfies Phase);
      record('votes', plan.at, '0');
      // The App is waiting again, because a new request is what opened this.
      // Leaving the previous answer up would say the coordinator is deciding
      // something it has already answered.
      record('app', plan.at, 'waiting' satisfies AppState);
      for (const key of STORES) {
        badges[key] = 'idle';
        setBadge(plan.at, key, 'idle');
        setLock(plan.at, key, 'off');
      }
      cue(plan.at, 'trip');
      const sendAt = round(plan.at + PHASE_LEAD);
      schedule(sendAt, () => broadcast(sendAt, 'prepare'));

      // The promise held in the open: every vote in, nothing written. It is
      // hung off the last vote rather than off the clock, so it can only ever
      // land where the derivation puts it.
      if (index === 0) {
        const votesInAt = round(plan.at + PHASE_LEAD + LEG + Math.max(...plan.validate) + LEG);
        const markAt = round(votesInAt + PROMISE_LAG);
        schedule(markAt, () => {
          if (badges.orders !== 'prepared' || badges.payments !== 'prepared') {
            throw new Error(`${ID} scene: the promise was held up with nothing promised`);
          }
          record('mark', markAt, 'promise' satisfies Mark);
          cue(markAt, 'state');
        });
        const dropAt = round(markAt + HOLD_FOR);
        schedule(dropAt, () => record('mark', dropAt, 'off' satisfies Mark));
      }
    });
  };

  // --- the first step, which demonstrates the thing being ruled out --------

  schedule(APP_WAITS_AT, () => {
    record('app', APP_WAITS_AT, 'waiting' satisfies AppState);
    cue(APP_WAITS_AT, 'state');
  });

  for (const key of STORES) {
    const at = GHOST_AT[key];
    schedule(at, () => {
      setGhost(at, key, GHOST_SHOWS[key]);
      // The first half of the contradiction is only a commit; the second is
      // what makes it a contradiction, which is why that one is the failure.
      const complete = STORES.every((other) => GHOST_AT[other] <= at);
      cue(at, complete ? 'failure' : 'state');
    });
  }

  schedule(GHOST_MARK_AT, () => {
    record('mark', GHOST_MARK_AT, 'half' satisfies Mark);
    cue(GHOST_MARK_AT, 'state');
  });

  schedule(GHOST_CLEAR_AT, () => {
    for (const key of STORES) setGhost(GHOST_CLEAR_AT, key, 'off');
    record('mark', GHOST_CLEAR_AT, 'off' satisfies Mark);
    cue(GHOST_CLEAR_AT, 'state');
  });

  schedule(ATOMIC_AT, () => {
    record('mark', ATOMIC_AT, 'atomic' satisfies Mark);
    cue(ATOMIC_AT, 'state');
  });
  const atomicOff = round(ATOMIC_AT + ATOMIC_HOLD);
  schedule(atomicOff, () => record('mark', atomicOff, 'off' satisfies Mark));

  // --- the transactions, and the crash that lands inside one of them -------

  TRANSACTIONS.forEach((plan, index) => open(plan, index));

  schedule(CRASH_AT, () => {
    record('coord', CRASH_AT, 'down' satisfies CoordState);
    cue(CRASH_AT, 'failure');
  });

  schedule(RECOVER_AT, () => {
    record('coord', RECOVER_AT, 'up' satisfies CoordState);
    cue(RECOVER_AT, 'state');
  });

  // The wait, sampled while it lasts. Nothing changes during it, which is the
  // point: the samples are there so the reader can feel the length of a window
  // whose whole content is that two stores are holding locks and cannot let go.
  for (let at = round(CRASH_AT + INDOUBT_LEAD); at < RECOVER_AT; at = round(at + INDOUBT_PACE)) {
    const on = at;
    schedule(on, () => {
      if (badges.orders !== 'prepared' || badges.payments !== 'prepared') {
        throw new Error(`${ID} scene: the wait was sampled with nothing waiting at ${on}`);
      }
      record('mark', on, 'indoubt' satisfies Mark);
      cue(on, 'state');
    });
    const off = Math.min(round(on + INDOUBT_HOLD), round(RECOVER_AT - INDOUBT_TAIL));
    schedule(off, () => record('mark', off, 'off' satisfies Mark));
  }

  // --- run it --------------------------------------------------------------

  drain();

  if (outcomes.length !== TRANSACTIONS.length) {
    throw new Error(`${ID} scene: ${outcomes.length} of ${TRANSACTIONS.length} transactions closed`);
  }
  if (outcomes.join(',') !== 'commit,abort,commit') {
    throw new Error(`${ID} scene: the transactions ended as [${outcomes.join(',')}]`);
  }
  if (waitFor <= 0) {
    throw new Error(`${ID} scene: the coordinator died without a decision in flight`);
  }
  if (badges.orders !== 'committed' || badges.payments !== 'committed') {
    throw new Error(`${ID} scene: the scene settled on ${badges.orders}/${badges.payments}`);
  }
  if (logged !== 'idle') throw new Error(`${ID} scene: the coordinator closed on ${logged}`);

  // --- the series, put in time order and collapsed -------------------------

  // Changes are recorded as they are worked out rather than as they happen — a
  // deferred broadcast is booked before the crash that defers it — so each key
  // is sorted once here. Two changes to one key at one instant would otherwise
  // render in insertion order forwards and in reverse backwards, so only the
  // one that ends up applying is kept.
  const seriesOf = (key: string): Series[] => {
    const sorted = raw
      .filter((entry) => entry.key === key)
      .sort((left, right) => left.at - right.at || left.order - right.order);
    const atInstant: Series[] = [];
    for (const entry of sorted) {
      const last = atInstant[atInstant.length - 1];
      if (last && last.at === entry.at) last.value = entry.value;
      else atInstant.push({ at: entry.at, value: entry.value });
    }
    const out: Series[] = [];
    for (const entry of atInstant) {
      const last = out[out.length - 1];
      if (last && last.value === entry.value) continue;
      out.push(entry);
    }
    return out;
  };

  const flags: Record<string, Series[]> = {};
  for (const key of ['phase', 'votes', 'coord', 'app', 'mark', 'settled']) {
    flags[key] = seriesOf(key);
  }
  const stores: Record<StoreKey, StoreSeries> = {
    orders: {
      badge: seriesOf('badge-orders'),
      lock: seriesOf('lock-orders'),
      ghost: seriesOf('ghost-orders'),
    },
    payments: {
      badge: seriesOf('badge-payments'),
      lock: seriesOf('lock-payments'),
      ghost: seriesOf('ghost-payments'),
    },
  };

  // --- the invariants, checked against the series rather than the code -----

  // Every 10ms of the scene, read back out of what was recorded. The three
  // things that must never be true are the three things the protocol is for:
  // one store committed while the other aborted, a lock held by a store that is
  // not prepared, and a store that walked off `prepared` without being told to.
  const valueAt = (series: Series[], at: number, fallback: string): string => {
    let held = fallback;
    for (const entry of series) {
      if (entry.at > at + EPS) break;
      held = entry.value;
    }
    return held;
  };
  const terminal = new Set(['committed', 'aborted']);
  for (let step = 0; step <= 2400; step += 1) {
    const at = round(step / 100);
    const read = STORES.map((key) => ({
      key,
      badge: valueAt(stores[key].badge, at, 'idle'),
      lock: valueAt(stores[key].lock, at, 'off'),
      ghost: valueAt(stores[key].ghost, at, 'off'),
    }));
    const [first, second] = read;
    if (!first || !second) throw new Error(`${ID} scene: a store went missing at ${at}`);
    if (
      terminal.has(first.badge) &&
      terminal.has(second.badge) &&
      first.badge !== second.badge
    ) {
      throw new Error(`${ID} scene: ${first.badge}/${second.badge} at ${at} is a half commit`);
    }
    for (const entry of read) {
      const held = entry.lock === 'on';
      if (held !== (entry.badge === 'prepared')) {
        throw new Error(`${ID} scene: ${entry.key} is ${entry.badge} with lock ${entry.lock} at ${at}`);
      }
      if (entry.ghost !== 'off' && entry.badge !== 'idle') {
        throw new Error(`${ID} scene: ${entry.key} showed a ghost over a real ${entry.badge}`);
      }
    }
  }
  for (const key of STORES) {
    const series = stores[key].badge;
    for (let i = 1; i < series.length; i += 1) {
      const from = series[i - 1];
      const to = series[i];
      if (!from || !to || from.value !== 'prepared') continue;
      // The only ways out of a promise are the decision landing and the next
      // transaction opening on a store that has already been told.
      if (to.value !== 'committed' && to.value !== 'aborted') {
        throw new Error(`${ID} scene: ${key} left prepared for ${to.value} at ${to.at}`);
      }
    }
  }

  // --- the cues ------------------------------------------------------------

  // Everything the scene has to say is asked for; what survives is whatever
  // clears a step boundary and stands far enough from the cue before it. The
  // gap is measured against the last cue that was kept, not the last one that
  // was asked for, so thinning a burst can never leave two survivors closer
  // than the minimum.
  const asked = [...wanted].sort((left, right) => left.at - right.at);
  const cues: [number, SceneCue][] = [];
  let last = -99;
  for (const entry of asked) {
    if (BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP - EPS)) continue;
    if (entry.at - last < MIN_CUE_GAP - EPS) continue;
    last = entry.at;
    cues.push([entry.at, entry.name]);
  }

  travellers.sort((left, right) => left.start - right.start);

  return { flags, stores, travellers, cues, outcomes, waitFor };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const storeElements: Record<StoreKey, SVGGElement> = {
    orders: q<SVGGElement>(stage, '.tpc-store--orders', ID),
    payments: q<SVGGElement>(stage, '.tpc-store--payments', ID),
  };

  const sim = simulate();
  if (sim.outcomes.length !== TRANSACTIONS.length) {
    throw new Error(`${ID} scene: ${sim.outcomes.length} transactions ran`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-tpc-${name}`, entry.value, entry.at);
  }
  // A store carries its own state, because two of them stand in two different
  // places at once and only the store knows which one it is in.
  for (const key of STORES) {
    const element = storeElements[key];
    const series = sim.stores[key];
    for (const entry of series.badge) attr(tl, element, 'data-tpc-badge', entry.value, entry.at);
    for (const entry of series.lock) attr(tl, element, 'data-tpc-lock', entry.value, entry.at);
    for (const entry of series.ghost) attr(tl, element, 'data-tpc-ghost', entry.value, entry.at);
  }

  // --- what travels --------------------------------------------------------

  /** The centre column of each store, which is the whole of its lane. */
  const LANE_X: Record<StoreKey, number> = { orders: X_ORDERS, payments: X_PAYMENTS };

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const x = LANE_X[plan.lane];
    const from = plan.dir === 'down' ? Y_COORD_BOTTOM : Y_STORE_TOP;
    const to = plan.dir === 'down' ? Y_STORE_TOP : Y_COORD_BOTTOM;

    parkRequest(request, x, from);
    showRequest(tl, request, plan.start);
    // A vote carries its verdict the whole way up, because the answer is the
    // message: there is nothing else in it, and the store already knows.
    if (plan.mark !== null) markRequest(tl, request, plan.mark, plan.start);
    moveRequest(tl, request, to, round(plan.land - plan.start), plan.start);
    hideRequest(tl, request, plan.land, plan.mark === null ? FADE : VOTE_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: a coordinator with no phase and
  // no votes, two stores holding nothing, an App already waiting on a request
  // that arrived before the scene started, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
