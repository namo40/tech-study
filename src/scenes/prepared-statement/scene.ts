import gsap from 'gsap';
import {
  CACHE_CAPACITY,
  HIT_MAX,
  MISS_MAX,
  OK_MAX,
  SCENE_DURATION,
  VALUE_DX,
  VALUE_H,
  VALUE_W,
  X_LANE,
  Y_APP_BOTTOM,
  Y_DB_BOTTOM,
  Y_DB_TOP,
  Y_RESULTS_TOP,
} from './stage';
import type { ChipState, GhostState, LampState, LeakState, Mark, Mode, RowState, SlotState } from './stage';
import { q } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Prepared Statement scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told five things — the
 * seventeen queries, each a `(time, input kind)`; when the App switches between
 * gluing values into the text and sending them as parameters; how many plans
 * the cache can hold; when the scene holds something up; and when the picture
 * is called settled. One pass over the whole 24 seconds turns that into
 * everything else: which text each query is, whether that text is already
 * cached, both lamps, every slot's state, `hit n`, `miss n`, `ok n`, the rows
 * that come back and the one leak.
 *
 * Three derivations carry the argument. **The text is the identity, and the
 * mode decides what the text is.** A concatenated query's text contains the
 * value, so every value makes a different text; a parameterized query's text is
 * the skeleton, so every value makes the same one. `textOf()` is that sentence
 * and nothing else, and the build asserts what falls out of it: in `concat` the
 * cache never hits, and in `params` everything after the first execution does.
 *
 * **The injection and the cache miss are one fact seen twice.** The attack
 * string is not treated specially anywhere in the simulation. It is an input
 * like any other, and what happens to it is decided by the mode it arrives in:
 * concatenated, it becomes part of the sentence and the sentence it makes
 * returns every row; parameterized, it is compared as a name and matches
 * nobody. The build asserts both, and asserts that the leak happens exactly
 * once.
 *
 * **The cache is a fixed number of slots and nothing more.** Three slots, the
 * oldest text evicted when a fourth arrives. Nobody tells the scene that the
 * concatenated replay in the third step throws the parameterized plan away —
 * it falls out of the capacity, and that is why the first parameterized query
 * after the replay has to be compiled again.
 */

const ID = 'prepared-statement';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** App to Database: 200px. */
const LEG_QUERY = 0.28;
/** Database to Results: 230px, and so a shade longer at the same speed. */
const LEG_RESULT = 0.32;

/** What a text the server has never seen costs: a parse and then a plan. */
const MISS_DWELL = 0.5;
/** What a text it has costs: a lookup. */
const HIT_DWELL = 0.16;
/** The plan lamp lights after the parse lamp, because that is the order. */
const PLAN_LAG = 0.18;

/** How long a slot shows what just happened to it before going quiet. */
const SLOT_FLASH = 0.35;

/** How long before a query the input is loaded, and how long after its answer
    the input goes back to being empty. */
const LOAD_LEAD = 0.22;
const CLEAR_LAG = 0.3;

/** How long a request takes to fade once it is absorbed or answered. */
const FADE_LEG = 0.1;
/** How long a result marker holds, and how long it takes to go. */
const MARK_HOLD = 0.04;
const MARK_FADE = 0.11;

// --- what the scene is told ------------------------------------------------

/** What the App was handed. Neither is treated specially by the simulation. */
type Input = 'value' | 'injected';

interface QueryPlan {
  at: number;
  input: Input;
}

/**
 * Every query, and nothing about what happens to it. Whether it hits the plan
 * cache, what it costs, what it returns and whether anything leaks are all
 * decided by the mode in force when it reaches the Database and by what is in
 * the cache at that instant, neither of which is written here.
 *
 * Two pairs carry the argument, and each is the same attack string sent twice.
 * The one at 2.62 is glued into the text; the one at 9.20 rides beside it. Same
 * input, same database, opposite outcomes — and the only difference between
 * them is the mode.
 */
const QUERIES: QueryPlan[] = [
  // Concatenation: two ordinary values, each making its own text.
  { at: 0.35, input: 'value' },
  { at: 0.8, input: 'value' },
  // The same mechanism, handed something that closes the quote.
  { at: 2.62, input: 'injected' },
  // Parameters: the skeleton goes once, the value goes beside it.
  { at: 6.95, input: 'value' },
  { at: 9.2, input: 'injected' },
  // The concatenated world, replayed to price it: three values, three texts.
  { at: 12.75, input: 'value' },
  { at: 13.25, input: 'value' },
  { at: 13.75, input: 'value' },
  // Back to one skeleton, which the replay has just evicted.
  { at: 14.9, input: 'value' },
  { at: 15.8, input: 'value' },
  { at: 16.2, input: 'value' },
  { at: 16.6, input: 'value' },
  // Ordinary operation: the same statement, over and over.
  { at: 18.45, input: 'value' },
  { at: 18.95, input: 'value' },
  { at: 19.45, input: 'value' },
  { at: 19.95, input: 'value' },
  { at: 21.62, input: 'value' },
];

/**
 * How the App builds its query, and whether the concatenated world on screen is
 * the real one. The third step goes back to concatenation to price it, which is
 * a replay rather than a regression, so it is drawn as a ghost.
 */
interface ModeMove {
  at: number;
  mode: Mode;
  ghost: GhostState;
  cue: SceneCue | null;
}

const MODE_MOVES: ModeMove[] = [
  { at: 0, mode: 'concat', ghost: 'off', cue: null },
  { at: 6.4, mode: 'params', ghost: 'off', cue: 'trip' },
  { at: 12.5, mode: 'concat', ghost: 'on', cue: 'state' },
  { at: 14.4, mode: 'params', ghost: 'off', cue: 'state' },
];

/** When the scene holds something up, for how long, and how it sounds. */
const MARK_PLAN: [number, number, Mark, SceneCue][] = [
  [4.4, 0.6, 'handed', 'state'],
  [6.72, 0.6, 'hole', 'state'],
  [10.8, 0.6, 'structural', 'state'],
  [14.03, 0.35, 'churn', 'failure'],
  [21.2, 0.6, 'discipline', 'state'],
];

/** When the picture calls itself settled, once nothing is left to change. */
const SETTLE_AT = 23.3;

/** How close two samples of one repeating thing may sound, how close any cue
    may fall to another, and how close any of it may fall to a boundary. */
const SAMPLE_GAP: Record<string, number> = { ok: 1.1, miss: 0.75, hit: 0.8 };
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- the rule the whole scene turns on -------------------------------------

/** Which mode the App is building in at a given instant. */
function modeAt(at: number): Mode {
  let value: Mode = 'concat';
  for (const move of MODE_MOVES) {
    if (move.at > at + EPS) break;
    value = move.mode;
  }
  return value;
}

/**
 * The one place a query's identity is ever decided.
 *
 * A plan is cached against the text of the statement, so what the text is
 * decides everything downstream. Concatenation puts the value inside it, which
 * makes every value a different statement — this is the same sentence that
 * explains the injection, because a value that is part of the sentence can add
 * clauses to it. Parameters leave the value outside, so every call is the same
 * statement with different data hanging off it.
 *
 * The query's index is used as the concatenated value's stand-in, which is only
 * saying that no two of them are the same.
 */
function textOf(mode: Mode, index: number): string {
  return mode === 'concat' ? `concat-${index}` : 'params';
}

// --- what one pass over the scene produces ---------------------------------

/** The two declared segments, each named for what travels down it. */
type Lane = 'query' | 'result';

/**
 * How a traveller is drawn, which is only ever what it is carrying. `injected`
 * and `guarded` are the same input in the two modes: welded into the sentence,
 * and riding beside it as data.
 */
type Look = 'concat' | 'injected' | 'params' | 'guarded' | 'rows' | 'zero' | 'leak';

interface Traveller {
  lane: Lane;
  /** Absolute time it leaves its origin, and when it reaches the far edge. */
  start: number;
  arrive: number;
  /** The marker it pops, or nothing for a leg that ends in a plain fade. */
  result: 'ok' | 'fail' | null;
  look: Look;
  /** Whether a parameter rides beside it, which only a skeleton ever does. */
  carries: boolean;
}

interface Series {
  at: number;
  value: string;
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
  flags: Record<string, Series[]>;
  slots: Series[][];
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the derivation fails loudly. */
  hitTotal: number;
  missTotal: number;
  okTotal: number;
  leakTotal: number;
}

// --- the simulation --------------------------------------------------------

/**
 * Walks the whole scene in time order.
 *
 * The App's own events are booked before the traffic, so a query reads the mode
 * in force at the instant it is built rather than the one that was in force
 * when the step began. The cache is read on the Database's top edge, because
 * that is where the reader watches the query meet it, and a slot is claimed
 * there too: a server that has decided to compile has already made room.
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
  const fixed: Fixed[] = [];
  const candidates: Candidate[] = [];
  const problems: string[] = [];

  const fix = (at: number, name: SceneCue, family: string | null = null): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    fixed.push({ at: round(at), family, name });
  };
  const sample = (at: number, family: string, name: SceneCue): void => {
    if (at < 0 || at > SCENE_DURATION) return;
    candidates.push({ at: round(at), family, name });
  };

  // --- what the diagram is holding ----------------------------------------

  let hits = 0;
  let misses = 0;
  let oks = 0;
  let leaks = 0;
  let seals = 0;
  let paramCompiles = 0;
  let paramEvictions = 0;

  /** How many texts are being parsed and planned right now. A lamp is lit
      while at least one is, so two overlapping compiles do not put it out. */
  let parsing = 0;
  let planning = 0;

  /** The plan cache: the texts it holds, oldest first, and the slot each one
      is drawn in. Nothing else is remembered about a plan, because nothing
      else decides anything. */
  const cache: { text: string; slot: number }[] = [];

  /** Every execution, kept so the rules can be checked as rules. */
  const runs: { at: number; mode: Mode; input: Input; text: string; hit: boolean }[] = [];

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  record('mode', 0, 'concat' satisfies Mode);
  record('ghost', 0, 'off' satisfies GhostState);
  record('chip', 0, 'idle' satisfies ChipState);
  record('parse', 0, 'off' satisfies LampState);
  record('plan', 0, 'off' satisfies LampState);
  record('hit', 0, '0');
  record('miss', 0, '0');
  record('ok', 0, '0');
  record('rows', 0, 'none' satisfies RowState);
  record('leak', 0, 'off' satisfies LeakState);
  record('mark', 0, 'none' satisfies Mark);
  record('settled', 0, 'off');
  for (let slot = 0; slot < CACHE_CAPACITY; slot += 1) {
    record(`slot-${slot}`, 0, 'empty' satisfies SlotState);
  }

  // --- the App's own events, booked before any traffic ---------------------

  for (const move of MODE_MOVES) {
    if (move.at === 0) continue;
    schedule(move.at, () => {
      record('mode', move.at, move.mode);
      record('ghost', move.at, move.ghost);
      if (move.cue) fix(move.at, move.cue);
    });
  }

  // --- the traffic ---------------------------------------------------------

  QUERIES.forEach((plan, index) => {
    const next = QUERIES[index + 1];
    const loadAt = round(plan.at - LOAD_LEAD);

    // The input is loaded before the query goes, so the reader sees what is
    // being supplied before it sees what happens to it.
    schedule(loadAt, () => {
      record('chip', loadAt, (plan.input === 'injected' ? 'injected' : 'input') satisfies ChipState);
      if (plan.input === 'injected') fix(loadAt, 'state');
    });

    schedule(plan.at, () => {
      const mode = modeAt(plan.at);
      const text = textOf(mode, index);
      const reaches = round(plan.at + LEG_QUERY);

      travellers.push({
        lane: 'query',
        start: plan.at,
        arrive: reaches,
        result: null,
        look:
          mode === 'params'
            ? plan.input === 'injected'
              ? 'guarded'
              : 'params'
            : plan.input === 'injected'
              ? 'injected'
              : 'concat',
        carries: mode === 'params',
      });

      schedule(reaches, () => {
        // The cache is read here, on the Database's top edge, because that is
        // where the reader watches the query meet it.
        const held = cache.findIndex((entry) => entry.text === text);
        const hit = held >= 0;
        runs.push({ at: reaches, mode, input: plan.input, text, hit });

        if (hit) {
          hits += 1;
          record('hit', reaches, String(hits));
          const slot = cache[held]?.slot ?? 0;
          record(`slot-${slot}`, reaches, 'hit' satisfies SlotState);
          const quiet = round(reaches + SLOT_FLASH);
          schedule(quiet, () => record(`slot-${slot}`, quiet, 'warm' satisfies SlotState));
          sample(reaches, 'hit', 'success');
          if (index === QUERIES.length - 1) fix(reaches, 'success', 'hit');
        } else {
          misses += 1;
          record('miss', reaches, String(misses));
          sample(reaches, 'miss', 'state');

          // Room is made when the server decides to compile, not when it
          // finishes: the oldest text goes, whatever it was worth.
          let slot: number;
          if (cache.length >= CACHE_CAPACITY) {
            const evicted = cache.shift();
            slot = evicted?.slot ?? 0;
            if (evicted?.text === 'params') paramEvictions += 1;
            record(`slot-${slot}`, reaches, 'empty' satisfies SlotState);
          } else {
            const taken = new Set(cache.map((entry) => entry.slot));
            slot = 0;
            while (taken.has(slot)) slot += 1;
          }
          cache.push({ text, slot });
          if (text === 'params') paramCompiles += 1;
          const compiled = paramCompiles;

          // A text nobody has seen is parsed and then planned, and the lamps
          // say so for exactly as long as that takes.
          parsing += 1;
          record('parse', reaches, 'on' satisfies LampState);
          const planFrom = round(reaches + PLAN_LAG);
          schedule(planFrom, () => {
            planning += 1;
            record('plan', planFrom, 'on' satisfies LampState);
          });

          const stored = round(reaches + MISS_DWELL);
          schedule(stored, () => {
            parsing -= 1;
            if (parsing === 0) record('parse', stored, 'off' satisfies LampState);
            planning -= 1;
            if (planning === 0) record('plan', stored, 'off' satisfies LampState);
            record(`slot-${slot}`, stored, 'stored' satisfies SlotState);
            // The plan the concatenated replay threw away, compiled again.
            if (text === 'params' && compiled === 2) fix(stored, 'state');
            const quiet = round(stored + SLOT_FLASH);
            schedule(quiet, () => record(`slot-${slot}`, quiet, 'warm' satisfies SlotState));
          });
        }

        // The injected string being read as a condition rather than as a name
        // is the whole of the first step, so it is heard where it happens.
        if (plan.input === 'injected' && mode === 'concat') fix(reaches, 'state');

        const leaves = round(reaches + (hit ? HIT_DWELL : MISS_DWELL));
        const lands = round(leaves + LEG_RESULT);
        // What comes back is decided by what was actually executed. A value
        // glued into the sentence can change the sentence; a value sent as
        // data can only be compared with one.
        const leaked = plan.input === 'injected' && mode === 'concat';
        const empty = plan.input === 'injected' && mode === 'params';

        travellers.push({
          lane: 'result',
          start: leaves,
          arrive: lands,
          result: leaked ? 'fail' : 'ok',
          look: leaked ? 'leak' : empty ? 'zero' : 'rows',
          carries: false,
        });

        schedule(lands, () => {
          if (leaked) {
            leaks += 1;
            record('rows', lands, 'all' satisfies RowState);
            record('leak', lands, 'on' satisfies LeakState);
            fix(lands, 'failure');
          } else if (empty) {
            oks += 1;
            record('ok', lands, String(oks));
            record('rows', lands, 'zero' satisfies RowState);
            if (leaks > 0) {
              seals += 1;
              record('leak', lands, 'sealed' satisfies LeakState);
            }
            fix(lands, 'success', 'ok');
          } else {
            oks += 1;
            record('ok', lands, String(oks));
            record('rows', lands, 'one' satisfies RowState);
            sample(lands, 'ok', 'success');
          }

          // The input goes back to being empty once its answer is in, unless
          // the next one is already being loaded.
          const clearAt = round(lands + CLEAR_LAG);
          const nextLoad = next ? round(next.at - LOAD_LEAD) : Infinity;
          if (nextLoad > clearAt) {
            schedule(clearAt, () => record('chip', clearAt, 'idle' satisfies ChipState));
          }
        });
      });
    });
  });

  // --- the things the scene holds up --------------------------------------

  for (const [at, hold, value, name] of MARK_PLAN) {
    schedule(at, () => {
      record('mark', at, value);
      fix(at, name);
    });
    schedule(round(at + hold), () => record('mark', round(at + hold), 'none' satisfies Mark));
  }

  schedule(SETTLE_AT, () => {
    record('settled', SETTLE_AT, 'on');
    fix(SETTLE_AT, 'success');
  });

  // --- run it --------------------------------------------------------------

  drain();

  // --- the rules, checked as rules rather than as pictures ------------------

  // The claim the whole scene rests on, stated as what it forbids. A
  // concatenated query cannot hit, because no two of them are the same text.
  for (const run of runs) {
    if (run.mode === 'concat' && run.hit) {
      problems.push(`a concatenated query hit the plan cache at ${run.at}`);
    }
  }

  // And its other half: a parameterized query misses only when its skeleton is
  // not there, which happens once at the start and once because the replay in
  // the third step evicted it. One compile per eviction, plus the first.
  if (paramCompiles !== paramEvictions + 1) {
    problems.push(`${paramCompiles} skeleton compiles for ${paramEvictions} evictions`);
  }
  if (paramEvictions !== 1) {
    problems.push(`the skeleton was evicted ${paramEvictions} times, and the third step is about one`);
  }

  // The attack string is an input like any other, and the mode is the only
  // thing that decides what becomes of it.
  const injected = runs.filter((run) => run.input === 'injected');
  if (injected.length !== 2) {
    problems.push(`${injected.length} injected inputs, and the scene compares two`);
  }
  if (!injected.some((run) => run.mode === 'concat') || !injected.some((run) => run.mode === 'params')) {
    problems.push('the same injected input has to arrive once in each mode');
  }
  if (leaks !== 1) problems.push(`${leaks} leaks, and the scene is about exactly one`);
  if (seals !== 1) problems.push(`${seals} sealed readouts for ${leaks} leaks`);

  if (hits !== HIT_MAX) problems.push(`${hits} hits and the stage counts to ${HIT_MAX}`);
  if (misses !== MISS_MAX) problems.push(`${misses} misses and the stage counts to ${MISS_MAX}`);
  if (oks !== OK_MAX) problems.push(`${oks} ok results and the stage counts to ${OK_MAX}`);
  if (hits + misses !== QUERIES.length) {
    problems.push(`${QUERIES.length} queries but ${hits} hits and ${misses} misses`);
  }
  if (oks + leaks !== QUERIES.length) {
    problems.push(`${QUERIES.length} queries but ${oks} answers and ${leaks} leaks`);
  }
  if (cache.length > CACHE_CAPACITY) {
    problems.push(`the cache ended holding ${cache.length} plans in ${CACHE_CAPACITY} slots`);
  }
  if (parsing !== 0 || planning !== 0) {
    problems.push(`the scene ends with ${parsing} parses and ${planning} plans still running`);
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${problems.join('; ')}`);

  // --- the series, put in time order and collapsed -------------------------

  // Changes are recorded as they are worked out rather than as they happen — a
  // miss claims a slot before it fills it — so each key is sorted once here.
  // Two changes to one key at one instant would otherwise render in insertion
  // order forwards and in reverse backwards, so only the one that ends up
  // applying is kept.
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
  for (const key of [
    'mode',
    'ghost',
    'chip',
    'parse',
    'plan',
    'hit',
    'miss',
    'ok',
    'rows',
    'leak',
    'mark',
    'settled',
  ]) {
    flags[key] = seriesOf(key);
  }
  const slots = Array.from({ length: CACHE_CAPACITY }, (_value, slot) => seriesOf(`slot-${slot}`));

  // --- the cues ------------------------------------------------------------

  // Same shape as the other scenes: everything the scene has to say is kept,
  // and the three repeating families — a miss, a hit and an answer coming back
  // — are thinned to samples, so each is heard often enough to read as a rhythm
  // without becoming one.
  const accepted: Fixed[] = fixed
    .filter((entry) => !BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP - EPS))
    .sort((left, right) => left.at - right.at)
    .filter(
      (entry, index, list) =>
        index === 0 || entry.at - (list[index - 1]?.at ?? -99) >= MIN_CUE_GAP - EPS,
    );
  if (accepted.length !== fixed.length) {
    throw new Error(
      `${ID} scene: ${fixed.length - accepted.length} cues the scene has to make were crowded out`,
    );
  }

  const lastOf: Record<string, number> = { ok: -99, miss: -99, hit: -99 };
  candidates.sort((left, right) => left.at - right.at);
  for (const candidate of candidates) {
    let previous = lastOf[candidate.family] ?? -99;
    for (const other of accepted) {
      if (other.family === candidate.family && other.at < candidate.at && other.at > previous) {
        previous = other.at;
      }
    }
    if (candidate.at - previous < (SAMPLE_GAP[candidate.family] ?? 0.9) - EPS) continue;
    if (BOUNDARIES.some((edge) => Math.abs(candidate.at - edge) < BOUNDARY_GAP - EPS)) continue;
    if (accepted.some((other) => Math.abs(other.at - candidate.at) < MIN_CUE_GAP - EPS)) continue;
    lastOf[candidate.family] = candidate.at;
    accepted.push({ at: candidate.at, family: candidate.family, name: candidate.name });
    accepted.sort((left, right) => left.at - right.at);
  }

  const cues: [number, SceneCue][] = accepted
    .map((entry) => [entry.at, entry.name] as [number, SceneCue])
    .sort((left, right) => left[0] - right[0]);

  travellers.sort((left, right) => left.start - right.start);

  return {
    flags,
    slots,
    travellers,
    cues,
    hitTotal: hits,
    missTotal: misses,
    okTotal: oks,
    leakTotal: leaks,
  };
}

// --- the timeline ----------------------------------------------------------

/** Where a traveller starts, and the one coordinate its segment moves. */
const LANES: Record<Lane, { y: number; to: number }> = {
  query: { y: Y_APP_BOTTOM, to: Y_DB_TOP },
  result: { y: Y_DB_BOTTOM, to: Y_RESULTS_TOP },
};

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  if (sim.hitTotal !== HIT_MAX || sim.missTotal !== MISS_MAX || sim.okTotal !== OK_MAX) {
    throw new Error(
      `${ID} scene: ${sim.hitTotal} hits, ${sim.missTotal} misses and ${sim.okTotal} answers`,
    );
  }
  if (sim.leakTotal !== 1) {
    throw new Error(`${ID} scene: ${sim.leakTotal} leaks, and the first step is about one`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-pst-${name}`, entry.value, entry.at);
  }
  sim.slots.forEach((series, index) => {
    const slot = q<SVGGElement>(stage, `.pst-slot--${index + 1}`, ID);
    for (const entry of series) attr(tl, slot, 'data-pst-slot', entry.value, entry.at);
  });

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    // A traveller is drawn as what it is carrying, so a dot already says
    // whether the value is inside the sentence before it lands anywhere.
    request.group.classList.add(`pst-carry--${plan.look}`);

    parkRequest(request, X_LANE, lane.y);

    // The parameter rides beside the skeleton rather than inside it, which is
    // the whole pattern in one shape. It sits far enough out to clear the halo
    // the dot itself sweeps, so the two never read as one blob.
    if (plan.carries) {
      const value = attachToRequest(request, 'rect', {
        class: 'pst-val',
        x: String(VALUE_DX),
        y: String(-VALUE_H / 2),
        width: String(VALUE_W),
        height: String(VALUE_H),
        rx: '10',
      });
      gsap.set(value, { opacity: 1 });
    }

    showRequest(tl, request, plan.start);
    tl.to(
      request.group,
      {
        y: lane.to,
        duration: round(plan.arrive - plan.start),
        ease: 'none',
        immediateRender: false,
      },
      plan.start,
    );

    if (plan.result === null) {
      // A query reaching the Database is not a result yet: what it did is the
      // dot that leaves the other edge a moment later.
      hideRequest(tl, request, plan.arrive, FADE_LEG);
      return;
    }
    markRequest(tl, request, plan.result, plan.arrive);
    hideRequest(tl, request, round(plan.arrive + MARK_HOLD), MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: an App building its query by
  // concatenation with nothing supplied yet, a Database with dark lamps and a
  // cold cache, a Results box that has answered nothing, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
