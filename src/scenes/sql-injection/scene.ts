import gsap from 'gsap';
import {
  ROWS_NONE,
  ROWS_ONE,
  SCENE_DURATION,
  SPIKE_POINTS,
  STAGE_STATE,
  TABLE_ROWS,
  X_LANE,
  Y_APP_BOTTOM,
  Y_DB_TOP,
  Y_QUERY_BOTTOM,
  Y_QUERY_TOP,
} from './stage';
import type { Mark, Shape, Verdict } from './stage';
import { q } from '../shared/dom';
import { attachToRequest, hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * SQL Injection scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing on
 * this stage is a continuous quantity — a row count is a number and a shape is
 * one of three shapes — so scrubbing lands on the value rather than between two.
 *
 * Nothing the reader watches is placed by hand. The scene is told seven things:
 * what is typed and when (a time and one of three shapes), when the ghost of the
 * concatenated query is raised and when it is lowered onto two channels, when
 * the rule card is switched on, when the account's role is named, when the
 * dangerous command is attempted, how fast a traveller moves, and the four
 * moments the captions stop on.
 *
 * Everything else falls out of one pass over those inputs. Whether an input is
 * rejected is the rule card applied to its shape, not a flag; where it lands is
 * whichever channel exists at that instant; and what the database answers is
 * read off the query the answer belongs to — the whole table when a value was
 * glued into the sentence, one row when a real customer was asked for, and none
 * when the value was absurd. That last line is the entire argument of the second
 * step, and it is derived rather than asserted: the same spiky value that
 * emptied the table in the first step returns `rows 0` in the second, because
 * the only thing that changed is which channel it arrived on.
 *
 * Four things are checked rather than claimed. Once the two channels exist the
 * code track never changes shape again. Every input that is not rejected ends in
 * the data slot. A rejected input never reaches the database lane. And the
 * dangerous command never moves the row count, because being refused is not an
 * answer.
 */

const ID = 'sql-injection';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 1250;

/** The flight from the App down to the Query, and from the Query down to the DB. */
const LEG_INPUT = round((Y_QUERY_TOP - Y_APP_BOTTOM) / SPEED);
const LEG_EXEC = round((Y_DB_TOP - Y_QUERY_BOTTOM) / SPEED);

/** How long a traveller that carried no verdict takes to go. */
const FADE = 0.14;
/** A traveller wearing a verdict is held longer, because it is meant to be read. */
const MARK_FADE = 0.3;
/** The halo around a traveller, which is what keeps two of them apart. */
const HALO = 26;

// --- what the scene is told ------------------------------------------------

/** One thing typed into the field, and the shape it has. */
interface Typed {
  at: number;
  shape: Shape;
}

/**
 * Everything that is ever typed. The shape is the whole of what is authored
 * about it: whether it is rejected, where it lands and what comes back are all
 * read off the world at the moment it gets there.
 */
const INPUTS: Typed[] = [
  { at: 0.9, shape: 'spiky' },
  { at: 3.62, shape: 'normal' },
  { at: 6.9, shape: 'spiky' },
  { at: 8.9, shape: 'normal' },
  { at: 13.2, shape: 'spiky' },
  { at: 13.8, shape: 'normal' },
  { at: 15.7, shape: 'bypass' },
  { at: 19.6, shape: 'normal' },
  { at: 21, shape: 'normal' },
];

/** How long before it leaves the field a value is visible sitting in it. */
const CHIP_LEAD = 0.4;

/** How long the Query box takes to put an arrived value where it goes. */
const FUSE = 0.3;

/** How long after that the query is executed. */
const EXEC_GAP = 0.42;

/** When the concatenated query is raised as a ghost, and when it is lowered. */
const GHOST_AT = 0.5;
const SEPARATE_AT = 3;

/** When the rule card goes up, and when the account's role is named. */
const CHECK_AT = 12.5;
const ROLE_AT = 18.5;

/** When the command that is outside the role is attempted. */
const DANGER_AT = 19.22;

/** How long a verdict lamp stays lit before the card goes quiet again. */
const LAMP_HOLD = 0.7;

/** The four things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark][] = [
  [5, 'channels'],
  [10.9, 'shape'],
  [17, 'second'],
  [21.4, 'blast'],
];
const MARK_HOLD = 0.6;

/** When the picture is called settled: one channel each, nothing in flight. */
const SETTLE_AT = 22.4;

/** The shortest gap between any two cues, and how quiet a step boundary is. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;
const BOUNDARIES = [0, 6, 12, 18, 24];
const EPS = 1e-9;

// --- what the simulation produces ------------------------------------------

/** One discrete change to the stage. Everything here lives on the stage root. */
interface AttrChange {
  at: number;
  name: string;
  value: string;
}

/** How a traveller is drawn, which says what kind of thing it is carrying. */
type Kind = Shape | 'exec' | 'danger';

interface Journey {
  from: number;
  to: number;
  kind: Kind;
  showAt: number;
  duration: number;
  landAt: number;
  result: RequestResult | null;
}

/** One query that reached the database, and what it came back with. */
interface Answer {
  at: number;
  shape: Shape;
  glued: boolean;
  rows: number;
  breach: boolean;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  answers: Answer[];
  rejected: number[];
  landings: { at: number; shape: Shape }[];
  morphs: number[];
  rowsSeries: [number, number][];
  ok: number;
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fired: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const answers: Answer[] = [];
  const rejected: number[] = [];
  const landings: { at: number; shape: Shape }[] = [];
  const morphs: number[] = [];
  const rowsSeries: [number, number][] = [[0, ROWS_NONE]];
  const problems: string[] = [];

  const setAttr = (at: number, name: string, value: string): void => {
    raw.push({ at: round(at), name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fired.push([round(at), name]);
  };

  /** Whether the query is still one glued sentence or two channels. */
  let glued = true;
  /** Whether the concatenated world on screen is a replay rather than the truth. */
  let ghost = false;
  /** Whether the rule card is up. */
  let checking = false;
  /** Which verdict owns the card right now, so a stale reset cannot clear it. */
  let verdictSeq = 0;
  let ok = 0;

  const { schedule, drain } = createScheduler();

  /** What the last answer carried, written as the number it is. */
  const setRows = (at: number, value: number): void => {
    rowsSeries.push([round(at), value]);
    setAttr(at, 'data-sqli-rows', String(value));
  };

  /**
   * The card's answer about one input, and the lamp that says it. A later
   * verdict takes the card over, so the reset only fires for the verdict that
   * is still the current one.
   */
  const setVerdict = (at: number, value: Verdict): void => {
    verdictSeq += 1;
    const mine = verdictSeq;
    setAttr(at, 'data-sqli-verdict', value);
    const clears = round(at + LAMP_HOLD);
    schedule(clears, () => {
      if (verdictSeq !== mine) return;
      setAttr(clears, 'data-sqli-verdict', 'none');
    });
  };

  /**
   * What a query comes back with, said once. It is read off the query rather
   * than off the input: a value glued into the sentence is no longer a value, so
   * the answer is the whole table; a value that travelled as data is matched
   * against the rows, and an absurd name matches nobody.
   */
  const outcome = (shape: Shape, wasGlued: boolean): { breach: boolean; rows: number } => {
    const breach = wasGlued && shape !== 'normal';
    return { breach, rows: breach ? TABLE_ROWS : shape === 'normal' ? ROWS_ONE : ROWS_NONE };
  };

  /** A query reaching the database, and the readout it moves. */
  const answer = (at: number, shape: Shape, wasGlued: boolean): void => {
    const { breach, rows: carried } = outcome(shape, wasGlued);
    answers.push({ at: round(at), shape, glued: wasGlued, rows: carried, breach });
    setRows(at, carried);
    if (breach) {
      setAttr(at, 'data-sqli-all', 'on');
      cue(at, 'failure');
    } else {
      ok += 1;
      cue(at, 'success');
    }
  };

  // --- everything that is typed --------------------------------------------

  for (const typed of INPUTS) {
    const shows = round(typed.at - CHIP_LEAD);
    schedule(shows, () => {
      setAttr(shows, 'data-sqli-chip', typed.shape);
      // A value that is obviously wrong, and a value that is quietly wrong, are
      // both worth noticing as they are typed. An ordinary one is not.
      if (typed.shape !== 'normal') cue(shows, 'state');
    });

    schedule(typed.at, () => {
      const land = round(typed.at + LEG_INPUT);
      const verdict: Verdict = !checking ? 'none' : typed.shape === 'spiky' ? 'reject' : 'pass';

      journeys.push({
        from: Y_APP_BOTTOM,
        to: Y_QUERY_TOP,
        kind: typed.shape,
        showAt: typed.at,
        duration: LEG_INPUT,
        landAt: land,
        result: verdict === 'reject' ? 'fail' : null,
      });

      schedule(land, () => {
        if (verdict !== 'none') setVerdict(land, verdict);
        if (verdict === 'reject') {
          // Turned away at the door. Nothing is built, nothing is executed, and
          // the row count is untouched, because no query ever happened.
          rejected.push(land);
          cue(land, 'state');
          return;
        }

        const places = round(land + FUSE);
        schedule(places, () => {
          if (glued) {
            // The value is inside the sentence now: the track is a different
            // shape, and the shape is the attack.
            morphs.push(places);
            setAttr(places, 'data-sqli-code', 'morphed');
            cue(places, 'state');
          } else {
            landings.push({ at: places, shape: typed.shape });
            setAttr(places, 'data-sqli-data', 'filled');
            setAttr(places, 'data-sqli-held', typed.shape);
            // A spiky value sitting inertly in the slot is the second step's
            // whole point; a well formed one landing there anyway is the third
            // step's, and it lands as harmlessly as the last ordinary value did.
            if (typed.shape === 'spiky') cue(places, 'state');
            else if (typed.shape === 'bypass') cue(places, 'success');
          }

          const runs = round(places + EXEC_GAP);
          const wasGlued = glued;
          schedule(runs, () => {
            const lands = round(runs + LEG_EXEC);
            // The marker the traveller wears is the same verdict the readout
            // will show, asked one leg early.
            const { breach } = outcome(typed.shape, wasGlued);
            journeys.push({
              from: Y_QUERY_BOTTOM,
              to: Y_DB_TOP,
              kind: 'exec',
              showAt: runs,
              duration: LEG_EXEC,
              landAt: lands,
              result: breach ? 'fail' : 'ok',
            });
            schedule(lands, () => answer(lands, typed.shape, wasGlued));
          });
        });
      });
    });
  }

  // --- the ghost, and the two channels it is replaced by -------------------

  schedule(GHOST_AT, () => {
    ghost = true;
    setAttr(GHOST_AT, 'data-sqli-ghost', 'on');
    cue(GHOST_AT, 'state');
  });

  schedule(SEPARATE_AT, () => {
    ghost = false;
    glued = false;
    // The replay is withdrawn, and so is the answer it produced: nothing has
    // really been asked yet. What is left is a query with two channels.
    setAttr(SEPARATE_AT, 'data-sqli-ghost', 'off');
    setAttr(SEPARATE_AT, 'data-sqli-code', 'fixed');
    setAttr(SEPARATE_AT, 'data-sqli-all', 'off');
    setAttr(SEPARATE_AT, 'data-sqli-data', 'empty');
    setRows(SEPARATE_AT, ROWS_NONE);
    cue(SEPARATE_AT, 'trip');
  });

  // --- the filter at the door ----------------------------------------------

  schedule(CHECK_AT, () => {
    checking = true;
    setAttr(CHECK_AT, 'data-sqli-check', 'on');
    cue(CHECK_AT, 'state');
  });

  // --- how far the account reaches -----------------------------------------

  schedule(ROLE_AT, () => {
    setAttr(ROLE_AT, 'data-sqli-role', 'on');
    cue(ROLE_AT, 'state');
  });

  schedule(DANGER_AT, () => {
    const lands = round(DANGER_AT + LEG_EXEC);
    journeys.push({
      from: Y_QUERY_BOTTOM,
      to: Y_DB_TOP,
      kind: 'danger',
      showAt: DANGER_AT,
      duration: LEG_EXEC,
      landAt: lands,
      result: 'fail',
    });
    schedule(lands, () => {
      // Refused, not answered. The row count does not move, and that is the
      // difference between a small account and a lucky one.
      setAttr(lands, 'data-sqli-deny', 'on');
      cue(lands, 'state');
      const clears = round(lands + LAMP_HOLD);
      schedule(clears, () => setAttr(clears, 'data-sqli-deny', 'off'));
    });
  });

  // --- what the scene holds up, and where it stops -------------------------

  for (const [at, value] of MARK_AT) {
    schedule(at, () => {
      setAttr(at, 'data-sqli-mark', value);
      cue(at, 'state');
    });
    const ends = round(at + MARK_HOLD);
    schedule(ends, () => setAttr(ends, 'data-sqli-mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    setAttr(SETTLE_AT, 'data-sqli-settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  // --- what has to be true for the picture to mean anything ---------------

  // Once the value has a channel of its own, the sentence stops changing shape.
  // This is the promise the whole scene makes, so it is read off the run.
  for (const at of morphs) {
    if (at >= SEPARATE_AT) problems.push(`the code track morphed at ${at}, after the channels were separated`);
  }
  if (morphs.length !== 1) problems.push(`the code track morphed ${morphs.length} times`);

  // Every input that was not turned away ended in one of the two channels, and
  // after the separation that channel is always the slot.
  const executed = answers.length;
  const expected = INPUTS.length - rejected.length;
  if (executed !== expected) {
    problems.push(`${expected} inputs were not rejected and ${executed} queries ran`);
  }
  if (landings.length !== INPUTS.filter((typed) => typed.at > SEPARATE_AT).length - rejected.length) {
    problems.push(`${landings.length} values landed in the slot after the separation`);
  }
  for (const entry of landings) {
    if (entry.at < SEPARATE_AT) problems.push(`a value landed in the slot at ${entry.at}, before it existed`);
  }

  // A rejected input never reaches the database lane, and it is only ever
  // rejected by a card that is up.
  for (const at of rejected) {
    if (at < CHECK_AT) problems.push(`an input was rejected at ${at}, before the card was up`);
    if (answers.some((entry) => Math.abs(entry.at - at) < FUSE)) {
      problems.push(`a query ran at ${at}, where an input had just been rejected`);
    }
  }
  if (rejected.length !== 1) problems.push(`${rejected.length} inputs were rejected`);

  // The breach happens once, on the glued query, and never on a parameterized
  // one — including the parameterized query carrying the very same value.
  const breaches = answers.filter((entry) => entry.breach);
  if (breaches.length !== 1) problems.push(`${breaches.length} answers carried the whole table`);
  for (const entry of breaches) {
    if (!entry.glued) problems.push(`an answer carried the whole table at ${entry.at} without being glued`);
  }
  const spikyAsData = answers.filter((entry) => entry.shape !== 'normal' && !entry.glued);
  if (spikyAsData.length === 0) problems.push('no hostile value ever arrived as data');
  for (const entry of spikyAsData) {
    if (entry.rows !== ROWS_NONE) problems.push(`a hostile value as data returned ${entry.rows} rows at ${entry.at}`);
  }

  // The dangerous command never moves the row count.
  const denyAt = round(DANGER_AT + LEG_EXEC);
  for (const [at, value] of rowsSeries) {
    if (at === denyAt) problems.push(`the row count changed to ${value} at ${denyAt}, where a command was refused`);
    if (value < 0 || value > TABLE_ROWS) problems.push(`the row count reached ${value} at ${at}, which is not a drawn value`);
  }
  const settledRows = rowsSeries[rowsSeries.length - 1]?.[1];
  if (settledRows !== ROWS_ONE) problems.push(`the scene ends on ${settledRows} rows`);

  // The alarm is only ever up inside the replay that caused it.
  const alarmOn = raw.filter((change) => change.name === 'data-sqli-all' && change.value === 'on');
  const alarmOff = raw.filter((change) => change.name === 'data-sqli-all' && change.value === 'off');
  if (alarmOn.length !== 1 || alarmOff.length !== 1) {
    problems.push(`the alarm went up ${alarmOn.length} times and down ${alarmOff.length}`);
  }
  if ((alarmOn[0]?.at ?? 0) < GHOST_AT || (alarmOff[0]?.at ?? 0) > SEPARATE_AT) {
    problems.push('the alarm was up outside the replay');
  }
  if (ghost) problems.push('the scene ends inside the replay');

  // Two travellers on one column, closer than their haloes, would read as one.
  const byLane = new Map<number, Journey[]>();
  for (const journey of journeys) {
    const lane = byLane.get(journey.from) ?? [];
    lane.push(journey);
    byLane.set(journey.from, lane);
  }
  for (const lane of byLane.values()) {
    const sorted = [...lane].sort((left, right) => left.showAt - right.showAt);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (!previous || !current) continue;
      const previousGone = previous.landAt + (previous.result ? MARK_FADE : FADE);
      if (current.showAt >= previousGone) continue;
      for (let t = current.showAt; t <= previousGone; t = round(t + 0.01)) {
        const a = previous.from + (previous.to - previous.from) * Math.min(1, Math.max(0, (t - previous.showAt) / previous.duration));
        const b = current.from + (current.to - current.from) * Math.min(1, Math.max(0, (t - current.showAt) / current.duration));
        if (Math.abs(a - b) < HALO * 2) {
          problems.push(`two travellers were ${Math.abs(a - b).toFixed(0)}px apart at ${t}`);
          break;
        }
      }
    }
  }
  for (const journey of journeys) {
    if (journey.showAt < 0 || journey.landAt > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${journey.showAt}`);
    }
    for (const edge of BOUNDARIES) {
      const gone = journey.landAt + (journey.result ? MARK_FADE : FADE);
      if (journey.showAt < edge && gone > edge) problems.push(`a traveller crosses the boundary at ${edge}`);
    }
  }

  // A cue on a step boundary belongs to neither step, and two cues on top of
  // each other are one noise. Two of the same kind on one instant are folded,
  // because a ghost being raised and the value it is about being typed are one
  // thing happening.
  fired.sort((left, right) => left[0] - right[0]);
  const cues: [number, SceneCue][] = [];
  for (const entry of fired) {
    const previous = cues[cues.length - 1];
    if (previous && previous[0] === entry[0]) {
      if (previous[1] !== entry[1]) problems.push(`a ${previous[1]} and a ${entry[1]} cue share ${entry[0]}`);
      continue;
    }
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

  // --- the discrete changes, in time order and collapsed ------------------

  // Two changes to one thing at one instant would render in insertion order
  // forwards and in reverse going backwards, so that single frame would depend
  // on which way the reader scrubbed. Only the one that applies is kept.
  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) collapseAtInstant(folded, entry, (change) => change.name);

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const changes: AttrChange[] = [];
  for (const change of folded) {
    if (seen.get(change.name) === change.value) continue;
    seen.set(change.name, change.value);
    changes.push(change);
  }

  journeys.sort((left, right) => left.showAt - right.showAt);

  return { changes, cues, journeys, answers, rejected, landings, morphs, rowsSeries, ok };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  const breach = sim.answers.find((entry) => entry.breach);
  if (!breach || breach.at >= 6) throw new Error(`${ID} scene: the breach did not land in the first step`);
  const asData = sim.answers.find((entry) => entry.shape === 'spiky' && !entry.glued);
  if (!asData || asData.at < 6 || asData.at >= 12) {
    throw new Error(`${ID} scene: the same value arriving as data did not land in the second step`);
  }
  const bypass = sim.landings.find((entry) => entry.shape === 'bypass');
  if (!bypass || bypass.at < 12 || bypass.at >= 18) {
    throw new Error(`${ID} scene: the well formed value did not land in the third step`);
  }

  const parts = mountRequests(layer, sim.journeys.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) attr(tl, stage, change.name, change.value, change.at);

  // --- what travels --------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;

    request.group.classList.add(`sqli-req--${journey.kind}`);
    parkRequest(request, X_LANE, journey.from);

    // A malformed value keeps its silhouette on the way down, because the shape
    // is what the scene is about. It is swapped for the verdict when one lands.
    let spike: SVGElement | null = null;
    if (journey.kind === 'spiky') {
      spike = attachToRequest(request, 'polygon', { class: 'sqli-spike', points: SPIKE_POINTS });
      gsap.set(spike, { opacity: 1 });
      gsap.set(request.dot, { opacity: 0 });
    }

    showRequest(tl, request, journey.showAt);
    tl.to(
      request.group,
      { y: journey.to, duration: journey.duration, ease: 'none', immediateRender: false },
      journey.showAt,
    );

    if (journey.result) {
      if (spike) tl.set(spike, { opacity: 0, immediateRender: false }, journey.landAt);
      markRequest(tl, request, journey.result, journey.landAt);
      hideRequest(tl, request, journey.landAt, MARK_FADE);
    } else {
      hideRequest(tl, request, journey.landAt, FADE);
    }
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: an empty input field, a query
  // that is one glued track with no data channel at all, no rule card, a
  // database that has answered nothing, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
