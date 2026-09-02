import {
  BUDGET_LABEL,
  BUDGET_MINUTES,
  GAUGE_W,
  PERIOD_DAYS,
  SCENE_DURATION,
  SLO,
  STAGE_STATE,
  X_LANE,
  Y_BUDGET_TOP,
  Y_TRAFFIC_BOTTOM,
  burnIndex,
  gaugeWidth,
  goodIndex,
  leftIndex,
} from './stage';
import type { Flip, Gate, Level, Summary } from './stage';
import { q } from '../shared/dom';
import { hideRequest, mountRequests, moveRequest, parkRequest, showRequest } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Error Budget scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 * The gauge is the one exception and is drawn rather than written — a width
 * tween with `ease: 'none'`, which is a quantity and reverses exactly.
 *
 * Nothing on this stage is placed by hand. The scene is told five things and
 * one pass over the whole 24 seconds derives the rest:
 *
 *   1. **the clock** — how many days of a budget period one second of the scene
 *      stands for, and how many days a period is;
 *   2. **the promise** — the SLO, which is the only place the allowance comes
 *      from. 99.9% over thirty days is 43.2 minutes of failure, and the `43m`
 *      at the end of the gauge is that arithmetic rather than a chosen figure;
 *   3. **the traffic** — the measured good-rate over time, as a handful of
 *      knots with straight lines between them. This is the whole input: two
 *      incident windows, and the calm either side of them;
 *   4. **the gate** — the share of the budget below which releases stop, the
 *      share above which they may start again, and the rule that a freeze trips
 *      the moment the number says so while a thaw waits for the next daily
 *      review;
 *   5. **the release cadence** — how often somebody tries to ship.
 *
 * Everything the reader counts falls out of walking that: the burn rate, the
 * budget left at every instant, the level the gauge reads at, when the gate
 * freezes and when it opens, how many releases got out, and what day it is. In
 * particular **the freeze is not a timestamp**. The gate closes at the sample
 * where the figure the stage is showing first reaches `FREEZE_AT`, and the only
 * way to move it is to change what the traffic did. Shorten the second incident
 * and there is no freeze at all — which is the argument the third step makes,
 * made by the model rather than asserted.
 *
 * Two compressions, both declared, neither of which touches a label.
 *
 * **The clock.** A thirty day budget period cannot be shown at one to one, so
 * one second of the scene stands for `1 / DAY_SECONDS` days: a period is 19.5
 * seconds, which leaves the scene time for one whole period and the opening of
 * the next. Every figure on the stage is the real one — 99.9% is 99.9%, `43m`
 * is forty-three minutes, `burn ×8` is eight times the pace that would spend
 * the allowance exactly — and only the playback rate is compressed.
 *
 * **The stream.** A bad minute is a minute; there is no drawing it. So one dot
 * stands for `BUDGET_PER_DOT` of the month's allowance, and the stream thickens
 * with the burn rate rather than with the traffic: a trickle at `×0.2`, a
 * stream at `×8`, and at `×20` the drawing gives up and runs at `DOT_MAX`
 * because two dots cannot occupy one lane. Good minutes are drawn as nothing,
 * because they cost nothing. Launching is suppressed for `QUIET_BEFORE` seconds
 * ahead of a step boundary and `QUIET_AFTER` after it, so nothing is ever in
 * flight when the reader arrives at one; the budget keeps draining through
 * those windows, so the dots either side stand for proportionally more.
 */

const ID = 'error-budget';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- the clock -------------------------------------------------------------

/** Seconds of the scene one day of the budget period stands for. */
const DAY_SECONDS = 0.65;

/** How long one whole period lasts in scene time: thirty days of it. */
const PERIOD_SECONDS = round(DAY_SECONDS * PERIOD_DAYS);

/** How finely the budget is integrated, and how often the readouts are sampled. */
const DT = 0.025;
const SAMPLE = 0.05;

// --- what the scene is told: the traffic ------------------------------------

interface Knot {
  /** When the measured good-rate reaches this value. */
  at: number;
  /** The share of requests succeeding, in percent. */
  good: number;
}

/**
 * The measured good-rate, as knots with straight lines between them. This is
 * the only series in the file, and every other number on the stage is read off
 * it: 99.98% is a service nobody is worried about, 99.90% is exactly the
 * promise, and 98.00% is an outage.
 *
 * Two incidents. The first is a bad hour that is noticed and mitigated, and its
 * whole cost is that the budget never comes back. The second is worse, arrives
 * while the first is still paid for, and is what closes the gate. The stretch
 * after it reads better than the calm the scene opened on, because that is what
 * a team does with a frozen release gate.
 */
const TRAFFIC: Knot[] = [
  { at: 0, good: 99.98 },
  { at: 6.6, good: 99.98 },
  { at: 7.0, good: 99.8 },
  { at: 7.2, good: 99.2 },
  { at: 7.45, good: 99.2 },
  { at: 7.75, good: 99.8 },
  { at: 8.15, good: 99.98 },
  { at: 13.8, good: 99.98 },
  { at: 14.0, good: 98.0 },
  { at: 14.25, good: 98.0 },
  { at: 14.45, good: 99.4 },
  { at: 14.75, good: 99.99 },
  { at: 19.5, good: 99.99 },
  { at: 20.4, good: 99.98 },
  { at: 24, good: 99.98 },
];

/**
 * After this the run is over: the budget stops moving and nothing is launched,
 * so the closing frame is a settled period with no dot in the air. The readouts
 * keep the traffic's figures, because the traffic did not change — the scene
 * simply ends.
 */
const QUIET_FROM = 23;

// --- what the scene is told: the gate ---------------------------------------

/** The share of the budget at which releases stop, and the share that frees them. */
const FREEZE_AT = 8;
const THAW_AT = 50;

/**
 * The bands the gauge reads itself in. They are not thresholds anything acts
 * on: the gate acts on `FREEZE_AT` alone, and these only decide the colour.
 */
const HEALTHY_ABOVE = 70;
const LOW_BELOW = 25;

/** Days between two release attempts, and the first day one is made on. */
const SHIP_EVERY = 4;

/** Days between two audible day marks, so a thirty day period is not a rattle. */
const DAY_CUE_EVERY = 7;

/** When the closing period's spending is put up for review. */
const SUMMARY_AT = 19.1;

// --- what the scene is told: the stream ------------------------------------

/** The share of the month's allowance one drawn dot stands for. */
const BUDGET_PER_DOT = 0.025;
/**
 * The most dots a second the lane can hold. A dot is drawn with a 26px halo
 * around it and is still fading where it landed while the next one is coming
 * down, so six a second is what keeps two of them 52px apart at every instant.
 */
const DOT_MAX = 6;
/** Pixels a second a dot travels, and how long it takes to fade once absorbed. */
const DOT_SPEED = 1000;
const DOT_FADE = 0.08;
/** The first and last dot, so neither the opening nor the closing frame has one. */
const DOT_FROM = 0.45;
const DOT_UNTIL = 22.4;
/** The clear air a step boundary is given, so nothing is in flight at one. */
const QUIET_BEFORE = 0.62;
const QUIET_AFTER = 0.35;

// --- what the scene is told: the sound -------------------------------------

/** When the promise is turned over to show the allowance behind it. */
const FLIP_AT = 0.5;
/** When the settled new period is confirmed, which is the last thing it says. */
const SETTLED_AT = 23.5;
/** Seconds between two sampled cues, so a walking number is not a rattle. */
const STATE_CUE_GAP = 0.9;
const SUCCESS_CUE_GAP = 4.5;
/** The burn a descent has to reach to be worth hearing, and the calm below it. */
const LOUD_BURN = 1.5;
const CALM_BURN = 0.5;
/** The burn above which a local maximum is an incident at its worst. */
const INCIDENT_BURN = 5;
/** The burn an incident has to fall back to before it counts as over. */
const RECOVERED_BURN = 0.25;
/** How close any cue may fall to another, and to a step boundary. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- reading the plan ------------------------------------------------------

/** The measured good-rate at an instant, straight lines between the knots. */
const goodAt = (t: number): number => {
  const first = TRAFFIC[0];
  if (!first) return 100;
  if (t <= first.at) return first.good;
  for (let i = 1; i < TRAFFIC.length; i += 1) {
    const b = TRAFFIC[i];
    const a = TRAFFIC[i - 1];
    if (!a || !b) break;
    if (t <= b.at) return a.good + ((b.good - a.good) * (t - a.at)) / (b.at - a.at);
  }
  return TRAFFIC[TRAFFIC.length - 1]?.good ?? 100;
};

/**
 * The burn rate: how many budgets a period of this traffic would spend. It is
 * the measured failure divided by the failure the promise allows, so `×1` is
 * the pace that ends the month at exactly zero and every other figure on the
 * gauge is that number integrated.
 */
const burnOf = (good: number): number => Math.max(0, (100 - good) / 100 / (1 - SLO));

/** Whether a dot may be launched at `t`, which is a drawing rule, not a model one. */
const streamOpen = (t: number): boolean => {
  if (t < DOT_FROM - EPS || t > DOT_UNTIL + EPS) return false;
  return !BOUNDARIES.some((edge) => t > edge - QUIET_BEFORE - EPS && t < edge + QUIET_AFTER - EPS);
};

// --- what one pass over the scene produces ---------------------------------

interface Change {
  at: number;
  name: string;
  value: string;
}

interface BarStep {
  at: number;
  width: number;
  duration: number;
  /** A step the gauge jumped to rather than walked to: written, not tweened. */
  snap?: boolean;
}

interface Mover {
  start: number;
  land: number;
  fade: number;
}

interface Simulation {
  changes: Change[];
  gauge: BarStep[];
  movers: Mover[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the derivation fails loudly. */
  freezeAt: number | null;
  freezeLeft: number | null;
  thawAt: number | null;
  resetAt: number | null;
  ships: number[];
  finalLeft: number;
}

// --- the simulation --------------------------------------------------------

const SAMPLE_TICKS = Math.round(SAMPLE / DT);

/**
 * Walks the whole scene in time order.
 *
 * One `createScheduler` pass runs it: each tick books the next, and everything
 * a tick works out books itself from inside that tick — the release attempt a
 * day boundary carries, the gate reopening at the first review after the budget
 * came back.
 *
 * The budget is the only thing integrated. Everything else is read off it: the
 * level of the gauge, the figure under it, the band it reads in, the freeze, the
 * thaw, and how many releases got out. No freeze time and no `left` value is
 * written down anywhere in this file.
 */
function simulate(): Simulation {
  const { schedule, drain } = createScheduler();

  const changes: Change[] = [];
  const held: Record<string, string> = { ...STAGE_STATE };
  const write = (at: number, name: string, value: string): void => {
    if (held[name] === value) return;
    held[name] = value;
    changes.push({ at: round(at), name, value });
  };

  const gauge: BarStep[] = [];
  let gaugeWas = gaugeWidth(100);
  let gaugeFrom = 0;
  const snapGauge = (at: number, left: number): void => {
    const width = gaugeWidth(left);
    gauge.push({ at: round(at), width, duration: 0, snap: true });
    gaugeWas = width;
    gaugeFrom = round(at);
  };

  const movers: Mover[] = [];
  const keystones: { at: number; name: SceneCue }[] = [];
  const anchors: { at: number; name: SceneCue }[] = [];
  const samples: { at: number; name: SceneCue }[] = [];

  // --- what the diagram is holding -----------------------------------------

  /** The share of the allowance already spent. This is the only integral. */
  let spent = 0;
  let periodStart = 0;
  let day = 1;
  let ship = 0;
  let gate: Gate = 'open';
  let level: Level = 'healthy';

  let freezeAt: number | null = null;
  let freezeLeft: number | null = null;
  let thawAt: number | null = null;
  let resetAt: number | null = null;
  let thawFrom: number | null = null;
  const ships: number[] = [];

  /** The stream's own clock, and the pacing of the two sampled cues. */
  let sinceDot = 0;
  let nextDot = DOT_FROM;
  let lastStateCue = -STATE_CUE_GAP;
  let lastSuccessCue = -SUCCESS_CUE_GAP;
  /** Whether an incident is still running, so its end can be heard once. */
  let inIncident = false;
  /** The last sampled burn, and whether it is still climbing towards a peak. */
  let lastBurn = burnOf(goodAt(0));
  let lastBurnAt = 0;
  let rising = false;

  // --- a day boundary -------------------------------------------------------

  /**
   * Everything that happens on a schedule rather than continuously: somebody
   * tries to ship, and the gate gets its review. A release attempt is made
   * whatever the budget says; whether it becomes a release is the gate's answer,
   * which is the whole of the third step.
   */
  const dayTurned = (at: number, turned: number): void => {
    write(at, 'data-eb-day', String(turned));
    if (turned > 1 && (turned - 1) % DAY_CUE_EVERY === 0) anchors.push({ at: round(at), name: 'state' });
    else if (turned === PERIOD_DAYS) anchors.push({ at: round(at), name: 'state' });

    if (thawFrom !== null && at > thawFrom + EPS && gate === 'frozen') {
      gate = 'open';
      thawAt = round(at);
      thawFrom = null;
      write(at, 'data-eb-gate', 'open' satisfies Gate);
      keystones.push({ at: round(at), name: 'state' });
    }

    if (turned > 1 && (turned - 1) % SHIP_EVERY === 0 && gate === 'open') {
      ship += 1;
      ships.push(round(at));
      write(at, 'data-eb-ship', String(ship));
      anchors.push({ at: round(at), name: 'success' });
    }
  };

  // --- the end of a period --------------------------------------------------

  /**
   * The budget refills because the period ended, not because anything was
   * fixed. The gauge jumps rather than walks, the way every other thing that
   * stopped existing is written on this site, and the release counter starts
   * again because it counts releases in a period. The gate does not reopen
   * here: it reopens at the next review, which is the next day boundary.
   */
  const rollOver = (at: number): void => {
    spent = 0;
    periodStart = round(at);
    day = 1;
    ship = 0;
    level = 'healthy';
    resetAt = round(at);
    write(at, 'data-eb-summary', 'off' satisfies Summary);
    write(at, 'data-eb-left', '100');
    write(at, 'data-eb-level', 'healthy' satisfies Level);
    write(at, 'data-eb-day', '1');
    write(at, 'data-eb-ship', '0');
    snapGauge(at, 100);
    keystones.push({ at: round(at), name: 'trip' });
  };

  // --- one tick -------------------------------------------------------------

  const tick = (at: number, index: number): void => {
    if (at >= periodStart + PERIOD_SECONDS - EPS) rollOver(at);

    const good = goodAt(at);
    const burn = burnOf(good);

    // The midpoint of the interval, which is exact for the straight lines the
    // traffic is written as, so the budget does not depend on the tick size.
    if (at < QUIET_FROM - EPS) {
      spent += (burnOf(goodAt(at + DT / 2)) / PERIOD_SECONDS) * DT;
    }
    const leftNow = Math.max(0, 100 * (1 - spent));

    const turned = Math.min(PERIOD_DAYS, Math.floor((at - periodStart) / DAY_SECONDS + EPS) + 1);
    if (turned !== day) {
      day = turned;
      dayTurned(at, turned);
    }

    // The stream, drawn from the budget rather than from the traffic: a dot is
    // another slice of the allowance leaving, so a calm service lets one go
    // every couple of seconds and an outage runs the lane as fast as it will
    // hold. What the spending outruns is dropped rather than queued — the
    // backlog is capped at one dot — so the lane never pays back a burst after
    // the thing that caused it is over.
    if (at < QUIET_FROM - EPS) {
      sinceDot += (burnOf(goodAt(at + DT / 2)) / PERIOD_SECONDS) * DT;
    }
    if (sinceDot >= BUDGET_PER_DOT - EPS && at >= nextDot - EPS && streamOpen(at)) {
      const land = round(at + (Y_BUDGET_TOP - Y_TRAFFIC_BOTTOM) / DOT_SPEED);
      movers.push({ start: round(at), land, fade: DOT_FADE });
      sinceDot = Math.min(sinceDot - BUDGET_PER_DOT, BUDGET_PER_DOT);
      nextDot = round(at + 1 / DOT_MAX);
    }

    // The readings, sampled rather than written every tick, so a number walks at
    // a readable pace instead of flickering. The gate and the band are decided
    // from the figure the sample is about to write, so the badge and the number
    // can never disagree about which side of the threshold the budget is on.
    if (index % SAMPLE_TICKS === 0) {
      const shown = leftIndex(leftNow);
      write(at, 'data-eb-good', String(goodIndex(good)));
      write(at, 'data-eb-burn', String(burnIndex(burn)));
      write(at, 'data-eb-left', String(shown));

      const band: Level = shown >= HEALTHY_ABOVE ? 'healthy' : shown >= LOW_BELOW ? 'warn' : 'low';
      if (band !== level) {
        level = band;
        write(at, 'data-eb-level', band);
      }

      if (gate === 'open' && shown <= FREEZE_AT) {
        gate = 'frozen';
        freezeAt = round(at);
        freezeLeft = shown;
        write(at, 'data-eb-gate', 'frozen' satisfies Gate);
        keystones.push({ at: round(at), name: 'trip' });
      } else if (gate === 'frozen' && shown >= THAW_AT && thawFrom === null) {
        thawFrom = round(at);
      }

      const gauging = gaugeWidth(leftNow);
      if (
        at > 0 &&
        at < SCENE_DURATION &&
        at > gaugeFrom + EPS &&
        Math.abs(gaugeWas - gauging) >= 0.5
      ) {
        gauge.push({ at: gaugeFrom, width: gauging, duration: round(at - gaugeFrom) });
        gaugeWas = gauging;
      }
      gaugeFrom = Math.max(gaugeFrom, at);

      // An incident is at its worst where the burn stops climbing, which is one
      // sample back from where it first comes down. Nothing declares when that
      // is: it is a local maximum of the traffic, found by walking it.
      if (burn > lastBurn + EPS) {
        rising = true;
      } else if (rising && lastBurn >= INCIDENT_BURN) {
        rising = false;
        keystones.push({ at: lastBurnAt, name: 'failure' });
      } else if (burn < lastBurn - EPS) {
        rising = false;
      }
      lastBurn = burn;
      lastBurnAt = round(at);

      // An incident is loud while it is eating the budget and worth one more
      // sound when it is over, because "the incident ended" is the moment the
      // reader has to be told the spending stays spent.
      if (burn >= LOUD_BURN) {
        inIncident = true;
        if (at - lastStateCue >= STATE_CUE_GAP - EPS) {
          lastStateCue = at;
          samples.push({ at: round(at), name: 'state' });
        }
      } else if (inIncident && burn <= RECOVERED_BURN) {
        inIncident = false;
        anchors.push({ at: round(at), name: 'state' });
      }
      if (
        burn <= CALM_BURN &&
        gate === 'open' &&
        at > 1 &&
        at < SETTLED_AT &&
        at - lastSuccessCue >= SUCCESS_CUE_GAP - EPS
      ) {
        lastSuccessCue = at;
        samples.push({ at: round(at), name: 'success' });
      }
    }

    const next = round(at + DT);
    if (next <= SCENE_DURATION + EPS) schedule(next, () => tick(next, index + 1));
  };

  // --- the things that are switched on rather than derived -----------------

  schedule(FLIP_AT, () => {
    write(FLIP_AT, 'data-eb-flip', 'on' satisfies Flip);
    keystones.push({ at: FLIP_AT, name: 'state' });
  });

  schedule(SUMMARY_AT, () => {
    write(SUMMARY_AT, 'data-eb-summary', 'on' satisfies Summary);
    anchors.push({ at: SUMMARY_AT, name: 'state' });
  });

  schedule(SETTLED_AT, () => keystones.push({ at: SETTLED_AT, name: 'success' }));

  schedule(0, () => tick(0, 0));
  drain();

  // --- what the walk has to have produced ----------------------------------

  const finalLeft = Math.max(0, 100 * (1 - spent));
  if (freezeAt === null) throw new Error(`${ID} scene: the budget never ran low enough to freeze`);
  if (thawAt === null) throw new Error(`${ID} scene: the gate never reopened`);
  if (resetAt === null) throw new Error(`${ID} scene: the period never ended`);
  if (freezeLeft !== FREEZE_AT) {
    throw new Error(`${ID} scene: the gate froze at left ${freezeLeft}, not ${FREEZE_AT}`);
  }
  if (gate !== 'open') throw new Error(`${ID} scene: it ended with the gate ${gate}`);
  if (ships.length < 5) throw new Error(`${ID} scene: only ${ships.length} releases got out`);
  const frozenFrom = freezeAt;
  const frozenUntil = thawAt;
  if (ships.some((at) => at > frozenFrom && at < frozenUntil)) {
    throw new Error(`${ID} scene: a release got out while the gate was frozen`);
  }
  for (const entry of gauge) {
    if (entry.width < 0 || entry.width > GAUGE_W) {
      throw new Error(`${ID} scene: the gauge left the track at ${entry.at}`);
    }
  }

  // --- the changes, collapsed at each instant ------------------------------

  // Two changes to one attribute at one instant would render in insertion order
  // forwards and in reverse backwards, so that single frame would depend on
  // which way the reader scrubbed. Only the one that ends up applying is kept.
  const ordered: Change[] = [];
  for (const entry of changes) {
    let replaced = false;
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const candidate = ordered[i];
      if (!candidate || candidate.at !== entry.at) break;
      if (candidate.name === entry.name) {
        candidate.value = entry.value;
        replaced = true;
        break;
      }
    }
    if (!replaced) ordered.push(entry);
  }

  // --- the sound ------------------------------------------------------------

  // The keystones are the things the scene is about and are placed first: the
  // flip, the freeze, the reset, the thaw and the settled close. The other
  // anchors — releases, day marks, the end of an incident, the review — fill in
  // around them, and the sampled cues fill in around those.
  const byTime = (left: { at: number }, right: { at: number }): number => left.at - right.at;
  const kept: number[] = [];
  const cues: [number, SceneCue][] = [];
  const clear = (at: number): boolean =>
    !BOUNDARIES.some((edge) => Math.abs(at - edge) < BOUNDARY_GAP - EPS) &&
    kept.every((other) => Math.abs(at - other) >= MIN_CUE_GAP - EPS);
  for (const tier of [keystones, anchors, samples]) {
    for (const entry of [...tier].sort(byTime)) {
      if (!clear(entry.at)) continue;
      kept.push(entry.at);
      cues.push([entry.at, entry.name]);
    }
  }
  cues.sort((left, right) => left[0] - right[0]);

  return {
    changes: ordered,
    gauge,
    movers,
    cues,
    freezeAt,
    freezeLeft,
    thawAt,
    resetAt,
    ships,
    finalLeft,
  };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const fill = q<SVGRectElement>(stage, '.eb-gauge-fill', ID);

  // The figure at the end of the gauge is the promise's arithmetic rather than
  // a chosen number, and the label has to still agree with it.
  if (BUDGET_LABEL !== `${Math.floor(BUDGET_MINUTES)}m`) {
    throw new Error(
      `${ID} scene: the gauge is labelled ${BUDGET_LABEL} and the SLO allows ${BUDGET_MINUTES} minutes`,
    );
  }

  const sim = simulate();

  // The captions name four derived moments and the steps they belong to.
  // Nothing here places them: if the traffic is changed, this is what says the
  // captions have stopped describing the scene.
  const { freezeAt, thawAt, resetAt } = sim;
  if (freezeAt === null || freezeAt <= 12 || freezeAt >= 18) {
    throw new Error(`${ID} scene: the gate froze at ${freezeAt}, not inside step 3`);
  }
  if (resetAt === null || resetAt <= 18 || resetAt >= 24) {
    throw new Error(`${ID} scene: the period rolled over at ${resetAt}, not inside step 4`);
  }
  if (thawAt === null || thawAt <= resetAt || thawAt >= 24) {
    throw new Error(`${ID} scene: the gate reopened at ${thawAt}`);
  }
  if (sim.finalLeft < 90) {
    throw new Error(`${ID} scene: the new period opened at ${sim.finalLeft.toFixed(1)}% left`);
  }

  const parts = mountRequests(layer, sim.movers.length, ID);

  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) attr(tl, stage, change.name, change.value, change.at);

  /** Nothing may run past the end of the scene: a tween that would is cut at it. */
  const fit = (at: number, duration: number): number =>
    Math.max(0.01, Math.min(duration, SCENE_DURATION - at));

  // --- the gauge, which walks rather than steps ----------------------------

  for (const entry of sim.gauge) {
    // The one jump is the period ending, and it is written the way every other
    // discrete change on this stage is written: a zero-duration set, which
    // reverses exactly and leaves no frame in between for a scrub to land on.
    if (entry.snap) {
      tl.set(fill, { attr: { width: entry.width }, immediateRender: false }, entry.at);
      continue;
    }
    tl.to(
      fill,
      {
        attr: { width: entry.width },
        duration: fit(entry.at, entry.duration),
        ease: 'none',
        immediateRender: false,
      },
      entry.at,
    );
  }

  // --- the stream ----------------------------------------------------------

  sim.movers.forEach((mover, index) => {
    const item = parts[index];
    if (!item) return;
    parkRequest(item, X_LANE, Y_TRAFFIC_BOTTOM);
    showRequest(tl, item, mover.start);
    moveRequest(tl, item, Y_BUDGET_TOP, round(mover.land - mover.start), mover.start);
    hideRequest(tl, item, mover.land, Math.min(mover.fade, fadeAt(mover.land, SCENE_DURATION)));
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: a service above its promise, a
  // full budget on day one of thirty, an open gate, nothing shipped, and
  // nothing in the air. Only the allowance the promise converts to is still
  // unsaid, because working it out is what the first step is.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
