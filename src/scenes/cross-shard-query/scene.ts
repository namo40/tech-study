import gsap from 'gsap';
import {
  CARD_IDS,
  CARD_NAMES,
  LATENCIES,
  MS_VALUES,
  SCENE_DURATION,
  SHARD_IDS,
  STAGE_STATE,
  X_LANE,
  Y_APP_BOTTOM,
  Y_ROUTER_BOTTOM,
  Y_ROUTER_TOP,
  Y_SHARDS_TOP,
} from './stage';
import type { CardId, CardState, ShardId } from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Cross-shard Query scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing here
 * is a continuous quantity — a latency is one of eight drawn values, a `gather`
 * bar holds one of four answers, the router has resolved a question to one of
 * four places or to nowhere — so every frame is a set of stacked variants and
 * scrubbing backwards lands on a value rather than on a blend of two.
 *
 * Nothing the reader reads is authored. The scene is told nine things: what each
 * shard costs to answer (`S3` is the slow one), what a summary read costs, how
 * long a gather waits before giving up on a shard, what one extra unanswered
 * broadcast adds to every shard, when each query is asked and whether it carries
 * a key, which scatter is the one whose slow shard never answers, when the
 * summary is built and when writes touch it, and when the scene stops.
 *
 * Everything else falls out of one pass. A query that carries a key is routed to
 * the single shard the key names; a query with no key is routed to the summary if
 * one exists and scattered to all three shards if none does. What the `ms n`
 * readout says is the cost of whichever of those happened: one shard's latency, a
 * summary read, the slowest participant in a scatter, or the budget the gather
 * burned before it gave up. The `gather` bar's fill is how many participants have
 * answered, a shard turns `slow` when it is the only participant still
 * outstanding, and the `partial` lamp is what the gather turns into when the slow
 * one never arrives. The first step's price is the same arithmetic run in a world
 * where no question carries a key: every ask lands on every shard, each unanswered
 * ask makes every shard slower, and the meter reads the worst of them.
 *
 * The scene draws no key-to-shard rule and no rebalance. Which shard a key
 * belongs to is the sharding scene's subject and moving a shard's data is the
 * rebalancing scene's; this one takes routing as settled and is only ever about
 * what a question with no key costs, and what you reshape so it stops costing it.
 */

const ID = 'cross-shard-query';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 300;

/** The upper lane: a query on its way to the router. */
const LEG_ASK = round((Y_ROUTER_TOP - Y_APP_BOTTOM) / SPEED);
/** The lower lane: whatever the router decided to send. */
const LEG_SEND = round((Y_SHARDS_TOP - Y_ROUTER_BOTTOM) / SPEED);

/**
 * The gap between the three travellers of one scatter. A scatter is parallel;
 * drawing it needs one column, so the three go one after another far enough
 * apart that no two halos (r 26) ever touch.
 */
const SCATTER_GAP = 0.4;

/** How long a traveller takes to go once it has nothing left to do. */
const MARK_FADE = 0.14;

// --- what the scene is told ------------------------------------------------

/** Scene seconds per millisecond, so a wait lasts as long as it costs. */
const MS_SEC = 0.003;

/** What each shard costs to answer. `S3` is the slow one, and that is the point. */
const SHARD_MS: Record<ShardId, number> = { s1: 30, s2: 30, s3: 90 };

/** What reading the summary costs, which is a keyed read of one shard. */
const VIEW_MS = 12;

/** How long a gather waits on a participant before it returns what it has. */
const TIMEOUT_MS = 120;

/** What one more unanswered broadcast adds to every shard in the first step. */
const QUEUE_MS = 45;

/** When each query with no key is asked in the world where none has one. */
const GHOST_ASKS = [0.5, 0.95, 1.4];

/** When that world is released and the router has keys to route by. */
const LIFT_AT = 3.0;

/**
 * Every query after the lift: when it is asked, and whether it carries the
 * partition key. Nothing here says where a query goes — the key decides that
 * when it has one, and whether a summary exists decides it when it does not.
 */
interface QueryPlan {
  at: number;
  kind: 'keyed' | 'keyless';
  key?: ShardId;
}

const QUERIES: QueryPlan[] = [
  { at: 6.6, kind: 'keyed', key: 's2' },
  { at: 7.7, kind: 'keyed', key: 's1' },
  { at: 12.6, kind: 'keyless' },
  { at: 14.75, kind: 'keyless' },
  { at: 18.9, kind: 'keyless' },
  { at: 19.9, kind: 'keyless' },
];

/**
 * The one scatter whose slow shard says nothing at all, named by the instant its
 * query was asked. Everything about the `partial` verdict follows from this: the
 * gather waits out its budget, the lamp lights, and the answer is returned marked
 * rather than quietly reported as complete.
 */
const SILENT = { queryAt: 14.75, shard: 's3' as ShardId };

/** When the summary is built, and when writes fold a change into it. */
const VIEW_AT = 18.5;
const WRITES = [18.55, 20.0];

/** How long the summary reads as just-updated. */
const FRESH_HOLD = 0.4;

/** How long a card holds the word that it just answered, or just gave up. */
const ANSWER_HOLD = 0.35;
const TIMEOUT_HOLD = 0.45;

/** How long a finished gather stays on the bar before it clears. */
const GATHER_HOLD = 0.25;

/** The six things the scene holds up, and how long each is held for. */
const MARK_AT: [number, string, number][] = [
  [3.9, 'carried', 0.6],
  [4.8, 'sheet', 0.4],
  [10.4, 'fleet', 0.3],
  [11.0, 'single', 0.3],
  [17.6, 'fan', 0.3],
  [21.85, 'shape', 0.35],
];

/** When the picture is called settled: one shard per question, and a small `ms`. */
const SETTLE_AT = 22.4;

/** The shortest gap between any two cues, and how quiet a step boundary is. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;
const BOUNDARIES = [0, 6, 12, 18, 24];
const EPS = 1e-9;

// --- what the simulation produces ------------------------------------------

/** One discrete change, and the thing on the stage it is written on. */
interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

/** How a traveller is drawn, which says what kind of thing it is carrying. */
type Kind = 'ask' | 'keyed' | 'send' | 'view';

interface Journey {
  y: number;
  to: number;
  kind: Kind;
  label: string;
  showAt: number;
  duration: number;
  /** When the result marker pops, or `null` for a traveller that just arrives. */
  markAt: number | null;
  result: RequestResult;
  hideAt: number;
}

/** One query, once the router has decided what it is. */
interface Resolved {
  at: number;
  kind: 'keyed' | 'keyless';
  /** Where it went: one shard, the summary, or every shard. */
  route: 'shard' | 'view' | 'scatter';
  touched: ShardId[];
  named: CardId | null;
  /** When the answer came back, and what the meter read for it. */
  answeredAt: number;
  ms: number;
  partial: boolean;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  resolved: Resolved[];
}

// --- the simulation --------------------------------------------------------

/** One query the router has taken in and not yet answered. */
interface Open {
  index: number;
  kind: 'keyed' | 'keyless';
  /** The card the router named for it, which a scatter never has. */
  named: CardId | null;
}

/** One shard's part in a scatter. */
interface Part {
  id: ShardId;
  landAt: number;
  landed: boolean;
  answered: boolean;
  finished: boolean;
}

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const resolved: Resolved[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };
  const stage = (at: number, name: string, value: string): void => {
    setAttr(at, 'stage', `data-csq-${name}`, value);
  };

  /** How many asks the world with no keys is holding and has not answered. */
  let ghostDepth = 0;
  let ghostOn = false;
  let msValue = 0;
  let askValue = 'off';
  let readValue = 'off';
  let scatterOn = false;
  let gatherValue = 'off';
  let gotValue = 0;
  let partialOn = false;
  let viewValue = 'absent';
  let viewReady = false;
  const cardState: Record<CardId, CardState> = {
    s1: 'idle',
    s2: 'idle',
    s3: 'idle',
    view: 'idle',
  };
  const cardLat: Record<CardId, number> = {
    s1: SHARD_MS.s1,
    s2: SHARD_MS.s2,
    s3: SHARD_MS.s3,
    view: VIEW_MS,
  };
  const open: Open[] = [];

  const { schedule, drain } = createScheduler();

  /** The meter. It only ever reads a cost the model worked out. */
  const setMs = (at: number, ms: number): void => {
    if (!(MS_VALUES as readonly number[]).includes(ms)) {
      problems.push(`${round(at)} the meter was asked to read ${ms}, which the stage never drew`);
      return;
    }
    if (msValue === ms) return;
    msValue = ms;
    stage(at, 'ms', String(ms));
  };

  /**
   * What a card is doing. A card turning `slow` is the one noise the third step
   * is about, so it is made here rather than anywhere a schedule is written.
   */
  const setCard = (at: number, id: CardId, want: CardState): void => {
    if (cardState[id] === want) return;
    cardState[id] = want;
    setAttr(at, `card-${id}`, 'data-csq-card', want);
    if (want === 'slow') cue(at, 'state');
  };

  const setLat = (at: number, id: CardId, ms: number): void => {
    if (!(LATENCIES as readonly number[]).includes(ms)) {
      problems.push(`${round(at)} ${id} was asked to draw ${ms} ms, which the stage never drew`);
      return;
    }
    if (cardLat[id] === ms) return;
    cardLat[id] = ms;
    setAttr(at, `card-${id}`, 'data-csq-lat', String(ms));
  };

  const setGather = (at: number, want: string): void => {
    if (gatherValue === want) return;
    gatherValue = want;
    stage(at, 'gather', want);
  };

  const setGot = (at: number, want: number): void => {
    if (gotValue === want) return;
    gotValue = want;
    stage(at, 'got', String(want));
  };

  const setPartial = (at: number, want: boolean): void => {
    if (partialOn === want) return;
    partialOn = want;
    stage(at, 'partial', want ? 'on' : 'off');
  };

  const setView = (at: number, want: string): void => {
    if (viewValue === want) return;
    viewValue = want;
    stage(at, 'view', want);
  };

  const setScatter = (at: number, want: boolean): void => {
    if (scatterOn === want) return;
    scatterOn = want;
    stage(at, 'scatter', want ? 'on' : 'off');
    if (want) cue(at, 'state');
  };

  /** Which chip the App is holding up, read off what is outstanding. */
  const refreshAsk = (at: number): void => {
    const last = open.at(-1);
    const want = last ? last.kind : 'off';
    if (askValue === want) return;
    const wasOff = askValue === 'off';
    askValue = want;
    stage(at, 'ask', want);
    if (wasOff && want !== 'off') cue(at, 'state');
  };

  /**
   * What the router has resolved a question to, read off what is outstanding.
   * The noise belongs to a key being read, so resolving to the summary — which
   * has no key to read — is silent.
   */
  const refreshRead = (at: number): void => {
    const named = open.filter((entry) => entry.named !== null).at(-1);
    const want = named?.named ?? 'off';
    if (readValue === want) return;
    const wasOff = readValue === 'off';
    readValue = want;
    stage(at, 'read', want);
    if (wasOff && want !== 'off' && want !== 'view') cue(at, 'state');
  };

  const closeQuery = (at: number, index: number): void => {
    const where = open.findIndex((entry) => entry.index === index);
    if (where >= 0) open.splice(where, 1);
    refreshAsk(at);
    refreshRead(at);
  };

  /** Lets a card fall back to rest, unless something else has claimed it. */
  const release = (at: number, id: CardId, from: CardState): void => {
    if (cardState[id] !== from) return;
    setCard(at, id, 'idle');
  };

  // --- the world where no question carries a key ---------------------------

  for (const at of GHOST_ASKS) {
    schedule(at, () => {
      if (!ghostOn) {
        ghostOn = true;
        stage(at, 'ghost', 'on');
      }
      if (askValue !== 'keyless') {
        const wasOff = askValue === 'off';
        askValue = 'keyless';
        stage(at, 'ask', 'keyless');
        if (wasOff) cue(at, 'state');
      }
      const land = round(at + LEG_ASK);
      journeys.push({
        y: Y_APP_BOTTOM,
        to: Y_ROUTER_TOP,
        kind: 'ask',
        label: '',
        showAt: round(at),
        duration: LEG_ASK,
        markAt: null,
        result: 'ok',
        hideAt: land,
      });
      schedule(land, () => {
        // A broadcast has nothing to decide, so it reaches every shard with the
        // ask rather than after a routing step. Every ask already in the box
        // makes every shard slower, which is the whole price of the world.
        ghostDepth += 1;
        setScatter(land, true);
        setGather(land, 'wait');
        let worst = 0;
        for (const id of SHARD_IDS) {
          const ms = SHARD_MS[id] + QUEUE_MS * (ghostDepth - 1);
          setLat(land, id, ms);
          setCard(land, id, 'busy');
          worst = Math.max(worst, ms);
        }
        setMs(land, worst);
        // Three machines, three asks in the air, one answer each: the point at
        // which the fan-out is costing exactly what the fleet can give.
        if (ghostDepth === SHARD_IDS.length) cue(land, 'failure');
      });
    });
  }

  schedule(LIFT_AT, () => {
    ghostOn = false;
    ghostDepth = 0;
    stage(LIFT_AT, 'ghost', 'off');
    stage(LIFT_AT, 'mode', 'keyed');
    if (askValue !== 'off') {
      askValue = 'off';
      stage(LIFT_AT, 'ask', 'off');
    }
    setScatter(LIFT_AT, false);
    setGather(LIFT_AT, 'off');
    for (const id of SHARD_IDS) {
      setCard(LIFT_AT, id, 'idle');
      setLat(LIFT_AT, id, SHARD_MS[id]);
    }
    cue(LIFT_AT, 'trip');
  });

  // --- the summary, and the writes that keep it honest ---------------------

  schedule(VIEW_AT, () => {
    viewReady = true;
    setView(VIEW_AT, 'present');
    cue(VIEW_AT, 'state');
  });

  for (const at of WRITES) {
    const land = round(at + LEG_SEND);
    journeys.push({
      y: Y_ROUTER_BOTTOM,
      to: Y_SHARDS_TOP,
      kind: 'view',
      label: CARD_NAMES.view,
      showAt: round(at),
      duration: LEG_SEND,
      markAt: land,
      result: 'ok',
      hideAt: land,
    });
    schedule(land, () => {
      setView(land, 'fresh');
      cue(land, 'state');
      schedule(round(land + FRESH_HOLD), () => {
        if (viewValue === 'fresh') setView(round(land + FRESH_HOLD), 'present');
      });
    });
  }

  // --- every query, routed by whether it carries the key -------------------

  /** One shard answering one question, which is what a key buys. */
  const single = (at: number, index: number, plan: QueryPlan, target: CardId, cost: number): void => {
    const land = round(at + LEG_SEND);
    const done = round(land + cost * MS_SEC);
    journeys.push({
      y: Y_ROUTER_BOTTOM,
      to: Y_SHARDS_TOP,
      kind: target === 'view' ? 'view' : 'send',
      label: CARD_NAMES[target],
      showAt: round(at),
      duration: LEG_SEND,
      markAt: done,
      result: 'ok',
      hideAt: done,
    });
    schedule(land, () => setCard(land, target, 'busy'));
    schedule(done, () => {
      setCard(done, target, 'answer');
      setMs(done, cost);
      resolved.push({
        at: round(plan.at),
        kind: plan.kind,
        route: target === 'view' ? 'view' : 'shard',
        touched: target === 'view' ? [] : [target as ShardId],
        named: target,
        answeredAt: done,
        ms: cost,
        partial: false,
      });
      closeQuery(done, index);
      cue(done, 'success');
      schedule(round(done + ANSWER_HOLD), () => release(round(done + ANSWER_HOLD), target, 'answer'));
    });
  };

  /** The question that belongs to everybody, and what waiting for it costs. */
  const scatter = (at: number, index: number, plan: QueryPlan): void => {
    const parts: Part[] = SHARD_IDS.map((id, order) => ({
      id,
      landAt: round(at + order * SCATTER_GAP + LEG_SEND),
      landed: false,
      answered: false,
      finished: false,
    }));
    let answered = 0;
    let gaveUp = false;
    setScatter(at, true);
    setGather(at, 'wait');
    setGot(at, 0);

    /**
     * A participant that is the last one outstanding once the others are in is
     * what the whole gather is now waiting on, and it is drawn as such.
     */
    const look = (now: number): void => {
      // Outstanding counts every participant the scatter has not heard from,
      // whether or not its traveller has arrived yet: the fan is parallel, and
      // drawing it down one column must not make an early shard look like the
      // last one anybody is waiting on.
      const waiting = parts.filter((part) => !part.finished);
      for (const part of waiting) {
        if (!part.landed) continue;
        setCard(now, part.id, waiting.length === 1 && answered > 0 ? 'slow' : 'busy');
      }
    };

    parts.forEach((part, order) => {
      const leaves = round(at + order * SCATTER_GAP);
      const silent = plan.at === SILENT.queryAt && part.id === SILENT.shard;
      const cost = silent ? TIMEOUT_MS : SHARD_MS[part.id];
      const ends = round(part.landAt + cost * MS_SEC);
      // An ask that the shard takes is absorbed on arrival; the one that is
      // never answered is still outstanding, so it stays on the lane until the
      // gather gives up on it, and that is the one cross in the scene.
      journeys.push({
        y: Y_ROUTER_BOTTOM,
        to: Y_SHARDS_TOP,
        kind: 'send',
        label: CARD_NAMES[part.id],
        showAt: leaves,
        duration: LEG_SEND,
        markAt: silent ? ends : part.landAt,
        result: silent ? 'fail' : 'ok',
        hideAt: silent ? ends : part.landAt,
      });
      schedule(part.landAt, () => {
        part.landed = true;
        look(part.landAt);
      });
      schedule(ends, () => {
        part.finished = true;
        if (silent) {
          // The budget ran out. What comes back is marked rather than quietly
          // reported as whole, which is the choice the caption is about.
          gaveUp = true;
          setCard(ends, part.id, 'timeout');
          setLat(ends, part.id, TIMEOUT_MS);
          setGather(ends, 'partial');
          setPartial(ends, true);
          setMs(ends, TIMEOUT_MS);
          setScatter(ends, false);
          resolved.push({
            at: round(plan.at),
            kind: plan.kind,
            route: 'scatter',
            touched: [...SHARD_IDS],
            named: null,
            answeredAt: ends,
            ms: TIMEOUT_MS,
            partial: true,
          });
          closeQuery(ends, index);
          cue(ends, 'state');
          const clear = round(ends + TIMEOUT_HOLD);
          schedule(clear, () => {
            release(clear, part.id, 'timeout');
            setLat(clear, part.id, SHARD_MS[part.id]);
            setGather(clear, 'off');
            setGot(clear, 0);
            setPartial(clear, false);
          });
          return;
        }
        part.answered = true;
        answered += 1;
        setCard(ends, part.id, 'answer');
        setGot(ends, answered);
        look(ends);
        schedule(round(ends + ANSWER_HOLD), () =>
          release(round(ends + ANSWER_HOLD), part.id, 'answer'),
        );
        if (answered === parts.length && !gaveUp) {
          // The answer is priced by the slowest participant and nothing else.
          const worst = Math.max(...parts.map((entry) => SHARD_MS[entry.id]));
          setGather(ends, 'done');
          setMs(ends, worst);
          setScatter(ends, false);
          resolved.push({
            at: round(plan.at),
            kind: plan.kind,
            route: 'scatter',
            touched: [...SHARD_IDS],
            named: null,
            answeredAt: ends,
            ms: worst,
            partial: false,
          });
          closeQuery(ends, index);
          cue(ends, 'success');
          const clear = round(ends + GATHER_HOLD);
          schedule(clear, () => {
            setGather(clear, 'off');
            setGot(clear, 0);
          });
        }
      });
    });
  };

  QUERIES.forEach((plan, index) => {
    schedule(plan.at, () => {
      open.push({ index, kind: plan.kind, named: null });
      refreshAsk(plan.at);
      journeys.push({
        y: Y_APP_BOTTOM,
        to: Y_ROUTER_TOP,
        kind: plan.kind === 'keyed' ? 'keyed' : 'ask',
        label: plan.kind === 'keyed' ? 'key' : '',
        showAt: round(plan.at),
        duration: LEG_ASK,
        markAt: null,
        result: 'ok',
        hideAt: round(plan.at + LEG_ASK),
      });
      const reaches = round(plan.at + LEG_ASK);
      schedule(reaches, () => {
        const entry = open.find((item) => item.index === index);
        // The one decision in the scene. A key names one shard; a question
        // without one is a summary read if a summary exists, and a scatter to
        // every shard if it does not.
        if (plan.kind === 'keyed' && plan.key) {
          if (entry) entry.named = plan.key;
          refreshRead(reaches);
          single(reaches, index, plan, plan.key, SHARD_MS[plan.key]);
          return;
        }
        if (viewReady) {
          if (entry) entry.named = 'view';
          refreshRead(reaches);
          single(reaches, index, plan, 'view', VIEW_MS);
          return;
        }
        scatter(reaches, index, plan);
      });
    });
  });

  // --- what the scene holds up, and where it stops -------------------------

  for (const [at, value, hold] of MARK_AT) {
    schedule(at, () => {
      stage(at, 'mark', value);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => stage(round(at + hold), 'mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    stage(SETTLE_AT, 'settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  return finish({ raw, fixed, journeys, resolved, problems });
}

// --- what has to be true for the picture to mean anything ------------------

interface RawSimulation {
  raw: AttrChange[];
  fixed: [number, SceneCue][];
  journeys: Journey[];
  resolved: Resolved[];
  problems: string[];
}

function finish(sim: RawSimulation): Simulation {
  const { raw, fixed, journeys, resolved } = sim;
  const problems = [...sim.problems];

  // Every query answered once, and routed by the one rule the scene draws.
  if (resolved.length !== QUERIES.length) {
    problems.push(`${resolved.length} of ${QUERIES.length} queries were answered`);
  }
  for (const plan of QUERIES) {
    const answers = resolved.filter((entry) => entry.at === round(plan.at));
    if (answers.length !== 1) {
      problems.push(`the query at ${plan.at} was answered ${answers.length} times`);
      continue;
    }
    const answer = answers[0];
    if (!answer) continue;
    if (answer.answeredAt <= plan.at) problems.push(`the query at ${plan.at} was answered before it was asked`);
    if (plan.kind === 'keyed') {
      if (answer.route !== 'shard') problems.push(`${plan.at} a query carrying the key did not go to one shard`);
      if (answer.touched.length !== 1) problems.push(`${plan.at} a keyed query touched ${answer.touched.length} shards`);
      if (answer.named !== plan.key) problems.push(`${plan.at} the key named ${plan.key} and the answer came from ${answer.named}`);
      if (answer.ms !== SHARD_MS[plan.key ?? 's1']) problems.push(`${plan.at} a keyed answer read ${answer.ms}`);
    } else if (answer.route === 'scatter') {
      if (answer.touched.length !== SHARD_IDS.length) {
        problems.push(`${plan.at} a scatter touched ${answer.touched.length} of ${SHARD_IDS.length} shards`);
      }
      // The one price rule: a whole answer costs the slowest participant, and a
      // partial one costs the budget the gather burned before it gave up.
      const worst = Math.max(...answer.touched.map((id) => SHARD_MS[id]));
      const want = answer.partial ? TIMEOUT_MS : worst;
      if (answer.ms !== want) {
        problems.push(`${plan.at} a scatter read ${answer.ms} where the slowest shard says ${want}`);
      }
      if (plan.at > VIEW_AT) problems.push(`${plan.at} a question scattered after the summary existed`);
    } else if (answer.route === 'view') {
      if (plan.at < VIEW_AT) problems.push(`${plan.at} a question read a summary that did not exist yet`);
      if (answer.ms !== VIEW_MS) problems.push(`${plan.at} a summary read cost ${answer.ms}`);
      if (answer.touched.length !== 0) problems.push(`${plan.at} a summary read touched a shard directly`);
    }
  }

  // Exactly one answer comes back marked, and it is the one whose slow shard
  // said nothing. Silence is never reported as a whole answer.
  const marked = resolved.filter((entry) => entry.partial);
  if (marked.length !== 1) problems.push(`${marked.length} answers came back marked, the captions describe one`);
  if (marked[0] && marked[0].at !== round(SILENT.queryAt)) {
    problems.push(`the marked answer belongs to the query at ${marked[0].at}`);
  }
  const scatters = resolved.filter((entry) => entry.route === 'scatter');
  if (scatters.length !== 2) problems.push(`${scatters.length} questions scattered, the third step draws two`);
  const summaries = resolved.filter((entry) => entry.route === 'view');
  if (summaries.length !== 2) problems.push(`${summaries.length} questions read the summary, the fourth step draws two`);
  for (const entry of summaries) {
    if (entry.ms >= Math.min(...SHARD_IDS.map((id) => SHARD_MS[id]))) {
      problems.push('reading the summary is not cheaper than asking a shard');
    }
  }

  // No traveller runs off either end of the scene, and no two on one lane are
  // ever close enough for their halos to touch.
  for (const journey of journeys) {
    if (journey.showAt < 0 || journey.hideAt + MARK_FADE > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${journey.showAt}`);
    }
    if (journey.hideAt < journey.showAt + journey.duration - EPS) {
      problems.push(`a traveller at ${journey.showAt} is taken away before it lands`);
    }
  }
  // Two travellers on one column, measured rather than assumed: a traveller that
  // has landed sits on the box edge until it fades, so the gap that matters is
  // between where they actually are, not between when they set off.
  const whereAt = (journey: Journey, t: number): number =>
    Math.min(journey.to, journey.y + (t - journey.showAt) * SPEED);
  for (const lane of [Y_APP_BOTTOM, Y_ROUTER_BOTTOM]) {
    const onLane = journeys.filter((journey) => journey.y === lane).sort((l, r) => l.showAt - r.showAt);
    for (let a = 0; a < onLane.length; a += 1) {
      for (let b = a + 1; b < onLane.length; b += 1) {
        const left = onLane[a];
        const right = onLane[b];
        if (!left || !right) continue;
        const from = Math.max(left.showAt, right.showAt);
        const to = Math.min(left.hideAt + MARK_FADE, right.hideAt + MARK_FADE);
        if (to <= from) continue;
        for (let t = from; t <= to + EPS; t = round(t + 0.01)) {
          const apart = Math.abs(whereAt(left, t) - whereAt(right, t));
          if (apart < 52 - EPS) {
            problems.push(
              `travellers from ${left.showAt} and ${right.showAt} are ${apart.toFixed(0)}px apart at ${round(t)}`,
            );
            t = to;
          }
        }
      }
    }
  }

  // --- the discrete changes, in time order and collapsed ------------------

  // Two changes to one thing at one instant would render in insertion order
  // forwards and in reverse going backwards, so that single frame would depend
  // on which way the reader scrubbed. Only the one that applies is kept.
  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}@${change.name}`);
  }

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const changes: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    changes.push(change);
  }

  // The gather bar never counts an answer it did not get, and never counts one
  // down inside a single gather: it clears from a `done` or a `partial` and from
  // nowhere else.
  let held = 0;
  let bar = 'off';
  for (const change of changes) {
    if (change.target !== 'stage') continue;
    if (change.name === 'data-csq-gather') bar = change.value;
    if (change.name !== 'data-csq-got') continue;
    const value = Number(change.value);
    if (value > SHARD_IDS.length) problems.push(`${change.at} the gather bar reads ${value}`);
    if (value < held && bar !== 'done' && bar !== 'partial' && bar !== 'off') {
      problems.push(`${change.at} the gather bar fell from ${held} to ${value} mid-gather`);
    }
    held = value;
  }

  // A cue on a step boundary belongs to neither step, and two cues on top of
  // each other are one noise.
  fixed.sort((left, right) => left[0] - right[0]);
  const cues: [number, SceneCue][] = [];
  for (const entry of fixed) {
    const previous = cues.at(-1);
    if (previous && previous[0] === entry[0]) continue;
    cues.push(entry);
  }
  cues.forEach(([at], index) => {
    if (BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP - EPS)) {
      problems.push(`a cue at ${at} sits on a step boundary`);
    }
    const previous = cues[index - 1]?.[0];
    if (previous !== undefined && at - previous < MIN_CUE_GAP - EPS) {
      problems.push(`cues at ${previous} and ${at} are on top of each other`);
    }
  });

  if (problems.length > 0) throw new Error(`${ID} scene: ${[...new Set(problems)].join('; ')}`);

  journeys.sort((left, right) => left.showAt - right.showAt);

  return { changes, cues, journeys, resolved };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  const keyed = sim.resolved.filter((entry) => entry.route === 'shard');
  if (keyed.length !== 2 || new Set(keyed.map((entry) => entry.ms)).size !== 1) {
    throw new Error(`${ID} scene: the second step promises two keyed answers at one price`);
  }
  const whole = sim.resolved.find((entry) => entry.route === 'scatter' && !entry.partial);
  if (!whole || whole.ms <= (keyed[0]?.ms ?? 0)) {
    throw new Error(`${ID} scene: the third step promises a scatter costs more than a keyed read`);
  }
  const summary = sim.resolved.filter((entry) => entry.route === 'view');
  if (summary.length === 0 || summary.some((entry) => entry.ms >= whole.ms)) {
    throw new Error(`${ID} scene: the fourth step promises the summary read is the cheap one`);
  }

  const targets: Record<string, Element> = { stage };
  for (const id of CARD_IDS) targets[`card-${id}`] = q(stage, `.csq-card--${id}`, ID);

  const parts = mountRequests(layer, sim.journeys.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) {
    const target = targets[change.target];
    if (!target) throw new Error(`${ID} scene: nothing on the stage is called "${change.target}"`);
    attr(tl, target, change.name, change.value, change.at);
  }

  // --- what travels --------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;

    // A question on its way to the router, a question that already names its
    // shard, one leg of a scatter, and a summary read are four different things
    // travelling the same kind of line.
    request.group.classList.add(`csq-req--${journey.kind}`);

    if (journey.label) {
      const label = attachToRequest(
        request,
        'text',
        { class: 'scene-req-label csq-tag', x: '-36', y: '9', 'text-anchor': 'end' },
        journey.label,
      );
      gsap.set(label, { opacity: 1 });
    }

    parkRequest(request, X_LANE, journey.y);
    showRequest(tl, request, journey.showAt);
    tl.to(
      request.group,
      { y: journey.to, duration: journey.duration, ease: 'none', immediateRender: false },
      journey.showAt,
    );

    if (journey.markAt !== null) markRequest(tl, request, journey.result, journey.markAt);
    hideRequest(tl, request, journey.hideAt, MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: an App with nothing to ask and
  // `ms 0`, a router that has read nothing, three idle shards whose bars already
  // say which one is slow, no summary, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
