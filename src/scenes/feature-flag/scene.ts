import {
  HASH_OF,
  PERCENT_OF,
  SCENE_DURATION,
  USER_IDS,
  V1_MAX,
  V2_MAX,
  X_IN,
  X_V1,
  X_V2,
  Y_FLAG_BOTTOM,
  Y_FLAG_TOP,
  Y_PATH_TOP,
  Y_USERS_BOTTOM,
} from './stage';
import type {
  CellState,
  DeployState,
  DialState,
  ErrorState,
  FlagState,
  Mark,
  SwitchState,
  UserId,
} from './stage';
import { q, qa } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Feature Flag scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told six things — the ten
 * callers and the bucket each one hashes into; the thirty-seven requests, each
 * a `(time, user)`; when the switch appears and when it is taken out again;
 * every setting the switch is moved to and when; the window in which v2 is
 * broken; and when the picture is called settled. One pass over the whole 24
 * seconds turns that into everything else: which path each request takes, both
 * `served n` readouts, which arrivals fail, what the lamp does, and which side
 * every caller is on at every instant.
 *
 * Three derivations carry the argument. **The side is a function of the bucket
 * and the setting, and of nothing else.** One `admits()` compares the caller's
 * hash with the percentage in force at the moment the request reaches the
 * switch. That is the whole of bucketing, and it is why the same caller cannot
 * change sides while the setting holds: the build runs every pair of requests
 * from one caller under one setting and fails if their answers differ. It is
 * also why the percentages are honest — the build asserts that 10 admits
 * exactly one of the ten callers and 50 admits exactly five, so the strip in
 * the middle band is the reason for the split rather than a picture of it.
 *
 * **The kill switch is not a special case.** It is the same lookup with the
 * percentage at zero, so every request that reaches the switch after it lands
 * goes to v1 by the ordinary rule, and the build asserts that nothing reaches
 * v2 under `off` or `kill` and that everything does under `100%` and under no
 * flag at all. Nothing is rolled back and nothing is redeployed: the broken
 * code is still there and the arrivals simply stop.
 *
 * **A flag that is gone and a flag that was never there are the same
 * mechanism.** Both are `none` — an unconditional path to v2 — which is exactly
 * why the first step is frightening and the fourth is not. What separates them
 * is the twelve seconds in between, so the stage draws them apart while the
 * simulation treats them alike.
 */

const ID = 'feature-flag';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** Users to Flag: 200px. */
const LEG_IN = 0.28;
/** Flag to a path: 230px, and so a shade longer at the same speed. */
const LEG_OUT = 0.32;
/** How long the switch holds a request between absorbing it and assigning it. */
const DECIDE = 0.1;

/** How long a request takes to fade once it is absorbed or answered. */
const FADE_LEG = 0.1;
/**
 * How long a result marker holds, and how long it takes to go. Together they
 * have to be shorter than the closest two departures to one path minus the time
 * a dot needs to cross a halo, or a marker would still be standing where the
 * next arrival lands. The tightest cadence in the scene is 0.24 s and a dot
 * covers the 52px halo in 0.072 s, so the marker gets 0.15 s and no more.
 */
const MARK_HOLD = 0.04;
const MARK_FADE = 0.11;

// --- what the scene is told ------------------------------------------------

interface RequestPlan {
  at: number;
  user: UserId;
}

/**
 * Every request, and nothing about where it goes. Which path each one takes is
 * the setting in force when it reaches the switch and the caller's bucket,
 * neither of which is written here.
 *
 * Three pairs carry the argument, and each is the same caller asked twice under
 * one setting: caller 4 at 6.80 and 8.48 under `10%`, caller 4 again at 14.75
 * and 16.25 under `kill`, and caller 8 at 12.80 under `50%` after 10.45 under
 * the same. Same caller, same bucket, same answer — and when the answer does
 * move, at 9.80 and at 14.20, it is because the setting moved and not because
 * the coin landed differently.
 */
const REQUESTS: RequestPlan[] = [
  // The world with no switch in it: the deploy is the release.
  { at: 0.62, user: 4 },
  { at: 0.86, user: 9 },
  // Shipped dark. The code is on every server and nobody is being sent to it.
  { at: 2.35, user: 1 },
  { at: 2.8, user: 5 },
  { at: 3.25, user: 3 },
  { at: 3.7, user: 7 },
  { at: 4.15, user: 10 },
  // Open to ten percent, which is one of these ten callers.
  { at: 6.8, user: 4 },
  { at: 7.04, user: 1 },
  { at: 7.28, user: 7 },
  { at: 7.52, user: 2 },
  { at: 7.76, user: 9 },
  { at: 8.0, user: 5 },
  { at: 8.24, user: 3 },
  { at: 8.48, user: 4 },
  // Widened to fifty.
  { at: 9.95, user: 4 },
  { at: 10.2, user: 3 },
  { at: 10.45, user: 8 },
  { at: 10.7, user: 5 },
  // v2 starts throwing, and half the callers are on it.
  { at: 12.3, user: 1 },
  { at: 12.55, user: 3 },
  { at: 12.8, user: 8 },
  { at: 13.05, user: 5 },
  { at: 13.3, user: 2 },
  // One flip, and the same callers come back to v1.
  { at: 14.75, user: 4 },
  { at: 15.05, user: 1 },
  { at: 15.35, user: 8 },
  { at: 15.65, user: 2 },
  { at: 15.95, user: 6 },
  { at: 16.25, user: 4 },
  // Fixed and opened to everybody.
  { at: 18.9, user: 3 },
  { at: 19.2, user: 5 },
  { at: 19.5, user: 7 },
  { at: 19.8, user: 10 },
  { at: 20.1, user: 4 },
  // The switch is gone and the path is unconditional.
  { at: 21.9, user: 6 },
  { at: 22.2, user: 9 },
];

/** When the new code lands on the servers, which is not when anybody sees it. */
const DEPLOY_AT = 0.5;

/** When the switch appears, and when it is taken back out. */
const SWITCH_MOVES: { at: number; value: SwitchState }[] = [
  { at: 1.9, value: 'on' },
  { at: 21.7, value: 'removed' },
];

/** Every setting the switch is moved to, and what moving it there sounds like. */
const FLAG_MOVES: { at: number; value: FlagState; cue: SceneCue }[] = [
  { at: 1.9, value: 'off', cue: 'trip' },
  { at: 6.4, value: 'p10', cue: 'state' },
  { at: 9.8, value: 'p50', cue: 'state' },
  { at: 14.2, value: 'kill', cue: 'trip' },
  { at: 18.6, value: 'p100', cue: 'trip' },
  { at: 21.7, value: 'none', cue: 'state' },
];

/**
 * The window in which v2 is wrong. It is a property of the build rather than of
 * the traffic: every request that reaches v2 while it is open fails, and no
 * request that reaches v1 ever fails, whenever it arrives.
 */
const ERROR_FROM = 12.9;
const ERROR_TO = 14.15;

/** When the lamp is read as having stopped, which is a beat after it stopped. */
const ERRORS_CLEAR_AT = 15.5;

/** When the scene holds something up, for how long, and how it sounds. */
const MARKS: [number, number, Mark, SceneCue][] = [
  [1.15, 0.6, 'noway', 'failure'],
  [2.35, 0.6, 'dark', 'state'],
  [4.55, 0.6, 'decides', 'state'],
  [9.2, 0.6, 'bucket', 'state'],
  [17.15, 0.6, 'cheap', 'state'],
  [18.35, 0.6, 'fixed', 'state'],
  [21.1, 0.6, 'debt', 'state'],
];

/** When the picture calls itself settled, once nothing is left to change. */
const SETTLE_AT = 23.4;

/** How close two samples of one repeating thing may sound, how close any cue
    may fall to another, and how close any of it may fall to a boundary. */
const SAMPLE_GAP: Record<string, number> = { served: 0.55 };
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- the rule the whole scene turns on -------------------------------------

/** Which setting the switch is on at a given instant. */
function flagAt(at: number): FlagState {
  let value: FlagState = 'none';
  for (const move of FLAG_MOVES) {
    if (move.at > at + EPS) break;
    value = move.value;
  }
  return value;
}

/** Whether there is a switch at all, and if not, why not. */
function switchAt(at: number): SwitchState {
  let value: SwitchState = 'ghost';
  for (const move of SWITCH_MOVES) {
    if (move.at > at + EPS) break;
    value = move.value;
  }
  return value;
}

/**
 * The one place a side is ever decided.
 *
 * With no flag the call site has no question to ask, so everybody reaches the
 * new code — which is the whole of the first step and the whole of the last.
 * With one, the caller's bucket is compared with the percentage: below it and
 * the caller is in, at or above it and the caller is out. Nothing about the
 * request itself is read, which is exactly why the same caller lands on the
 * same side every time.
 */
function admits(flag: FlagState, user: UserId): boolean {
  if (flag === 'none') return true;
  return HASH_OF[user] < PERCENT_OF[flag as DialState];
}

/** How many of the ten callers a setting admits. */
const admittedCount = (flag: FlagState): number =>
  USER_IDS.filter((user) => admits(flag, user)).length;

// --- what one pass over the scene produces ---------------------------------

/** The three declared segments, each named for what travels down it. */
type Lane = 'in' | 'v1' | 'v2';

interface Traveller {
  lane: Lane;
  /** Absolute time it leaves its origin, and when it reaches the far edge. */
  start: number;
  arrive: number;
  /** The marker it pops, or nothing for a leg that ends in a plain fade. */
  result: 'ok' | 'fail' | null;
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
  cells: Record<UserId, Series[]>;
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the derivation fails loudly. */
  v1Total: number;
  v2Total: number;
  errorTotal: number;
}

// --- the simulation --------------------------------------------------------

/**
 * Walks the whole scene in time order.
 *
 * The switch's own events are booked before the traffic, so a request that
 * arrives reads the setting in force at the instant it reaches the switch
 * rather than the one that was in force when it set off. That is the point of
 * the third step: the flip lands between one request and the next, and the
 * requests after it go somewhere else without anything being rebuilt.
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

  let v1Served = 0;
  let v2Served = 0;
  let errorTotal = 0;
  /** Every decision made, kept so the rules can be checked as rules. */
  const decisions: { at: number; user: UserId; flag: FlagState; toV2: boolean }[] = [];

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  record('flag', 0, 'none' satisfies FlagState);
  record('switch', 0, 'ghost' satisfies SwitchState);
  record('deployed', 0, 'off' satisfies DeployState);
  record('v1', 0, '0');
  record('v2', 0, '0');
  record('errors', 0, 'off' satisfies ErrorState);
  record('mark', 0, 'none' satisfies Mark);
  record('settled', 0, 'off');
  for (const user of USER_IDS) record(`cell-${user}`, 0, 'off' satisfies CellState);

  /**
   * Where every caller stands, which is a function of the setting and nothing
   * else. It is rewritten whenever the setting moves rather than tracked, so a
   * caller can only be somewhere the rule puts it.
   */
  const placeCallers = (at: number): void => {
    const flag = flagAt(at);
    for (const user of USER_IDS) {
      record(`cell-${user}`, at, (admits(flag, user) ? 'v2' : 'v1') satisfies CellState);
    }
  };

  // --- the switch's own events, booked before any traffic ------------------

  // The code lands on the servers. Without a flag that is the release, and the
  // whole of the first step is that those are two different sentences.
  schedule(DEPLOY_AT, () => {
    record('deployed', DEPLOY_AT, 'on' satisfies DeployState);
    placeCallers(DEPLOY_AT);
    fix(DEPLOY_AT, 'state');
  });

  for (const move of SWITCH_MOVES) {
    schedule(move.at, () => record('switch', move.at, move.value));
  }

  for (const move of FLAG_MOVES) {
    schedule(move.at, () => {
      record('flag', move.at, move.value);
      placeCallers(move.at);
      fix(move.at, move.cue);
    });
  }

  schedule(ERRORS_CLEAR_AT, () => {
    record('errors', ERRORS_CLEAR_AT, 'clear' satisfies ErrorState);
    fix(ERRORS_CLEAR_AT, 'state');
  });

  // --- the traffic ---------------------------------------------------------

  for (const plan of REQUESTS) {
    schedule(plan.at, () => {
      const reaches = round(plan.at + LEG_IN);
      travellers.push({ lane: 'in', start: plan.at, arrive: reaches, result: null });

      schedule(reaches, () => {
        // The switch is read here, on the Flag box's top edge, because that is
        // where the reader watches the request meet it.
        const flag = flagAt(reaches);
        const toV2 = admits(flag, plan.user);
        decisions.push({ at: reaches, user: plan.user, flag, toV2 });

        const leaves = round(reaches + DECIDE);
        const lands = round(leaves + LEG_OUT);
        const broke = toV2 && lands >= ERROR_FROM && lands < ERROR_TO;

        travellers.push({
          lane: toV2 ? 'v2' : 'v1',
          start: leaves,
          arrive: lands,
          result: broke ? 'fail' : 'ok',
        });

        schedule(lands, () => {
          if (broke) {
            errorTotal += 1;
            record('errors', lands, 'on' satisfies ErrorState);
            fix(lands, 'failure');
            return;
          }
          if (toV2) {
            v2Served += 1;
            record('v2', lands, String(v2Served));
          } else {
            v1Served += 1;
            record('v1', lands, String(v1Served));
          }
          sample(lands, 'served', 'success');
        });
      });
    });
  }

  // --- the things the scene holds up --------------------------------------

  for (const [at, hold, value, name] of MARKS) {
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

  // The percentages have to mean what they say, or the strip in the middle band
  // is a decoration. These four are the reason the hashes are authored.
  const admitChecks: [FlagState, number][] = [
    ['off', 0],
    ['p10', 1],
    ['p50', 5],
    ['p100', 10],
    ['kill', 0],
    ['none', 10],
  ];
  for (const [flag, want] of admitChecks) {
    const got = admittedCount(flag);
    if (got !== want) problems.push(`${flag} admits ${got} of the ten callers, not ${want}`);
  }

  // Bucketing, checked where it is claimed: one caller asked twice under one
  // setting must land on one side.
  for (const a of decisions) {
    for (const b of decisions) {
      if (a === b || a.user !== b.user || a.flag !== b.flag) continue;
      if (a.toV2 !== b.toV2) {
        problems.push(`caller ${a.user} changed sides under ${a.flag} between ${a.at} and ${b.at}`);
      }
    }
  }

  // A setting and a switch are the same fact told twice, and the two must not
  // be able to drift: there is no such thing as a switch with no setting, or a
  // setting with nothing to set it on.
  for (const at of [0, ...FLAG_MOVES.map((m) => m.at), ...SWITCH_MOVES.map((m) => m.at), 24]) {
    const hasSwitch = switchAt(at) === 'on';
    if (hasSwitch !== (flagAt(at) !== 'none')) {
      problems.push(`at ${at} the switch is ${switchAt(at)} and the setting is ${flagAt(at)}`);
    }
  }

  // What a setting is for, stated as what it forbids.
  for (const d of decisions) {
    if ((d.flag === 'off' || d.flag === 'kill') && d.toV2) {
      problems.push(`a request reached v2 under ${d.flag} at ${d.at}`);
    }
    if ((d.flag === 'p100' || d.flag === 'none') && !d.toV2) {
      problems.push(`a request missed v2 under ${d.flag} at ${d.at}`);
    }
  }

  // Errors belong to the build, not to the traffic: only v2, only in the window.
  for (const t of travellers) {
    if (t.result !== 'fail') continue;
    if (t.lane !== 'v2') problems.push(`an arrival on ${t.lane} failed at ${t.arrive}`);
    if (t.arrive < ERROR_FROM || t.arrive >= ERROR_TO) {
      problems.push(`an arrival failed at ${t.arrive}, outside the window`);
    }
  }

  if (v1Served !== V1_MAX) problems.push(`v1 served ${v1Served} and the stage counts to ${V1_MAX}`);
  if (v2Served !== V2_MAX) problems.push(`v2 served ${v2Served} and the stage counts to ${V2_MAX}`);
  if (v1Served + v2Served + errorTotal !== REQUESTS.length) {
    problems.push(
      `${REQUESTS.length} requests but ${v1Served} on v1, ${v2Served} on v2 and ${errorTotal} failed`,
    );
  }
  if (decisions.length !== REQUESTS.length) {
    problems.push(`${decisions.length} decisions for ${REQUESTS.length} requests`);
  }
  if (errorTotal === 0) problems.push('the third step needs at least one failed arrival');

  if (problems.length > 0) throw new Error(`${ID} scene: ${problems.join('; ')}`);

  // --- the series, put in time order and collapsed -------------------------

  // Changes are recorded as they are worked out rather than as they happen — a
  // setting moving rewrites all ten callers in one pass — so each key is sorted
  // once here. Two changes to one key at one instant would otherwise render in
  // insertion order forwards and in reverse backwards, so only the one that
  // ends up applying is kept.
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
  for (const key of ['flag', 'switch', 'deployed', 'v1', 'v2', 'errors', 'mark', 'settled']) {
    flags[key] = seriesOf(key);
  }
  const cells = Object.fromEntries(
    USER_IDS.map((user) => [user, seriesOf(`cell-${user}`)]),
  ) as Record<UserId, Series[]>;

  // --- the cues ------------------------------------------------------------

  // Same shape as the other scenes: everything the scene has to say is kept,
  // and the one repeating family — a request landing on a path that answered it
  // — is thinned to samples so an arrival is heard often enough to read as a
  // rhythm without becoming one.
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

  const lastOf: Record<string, number> = { served: -99 };
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
    cells,
    travellers,
    cues,
    v1Total: v1Served,
    v2Total: v2Served,
    errorTotal,
  };
}

// --- the timeline ----------------------------------------------------------

/** Where a traveller starts, and the one coordinate its segment moves. */
const LANES: Record<Lane, { x: number; y: number; to: number }> = {
  in: { x: X_IN, y: Y_USERS_BOTTOM, to: Y_FLAG_TOP },
  v1: { x: X_V1, y: Y_FLAG_BOTTOM, to: Y_PATH_TOP },
  v2: { x: X_V2, y: Y_FLAG_BOTTOM, to: Y_PATH_TOP },
};

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  if (sim.v1Total !== V1_MAX || sim.v2Total !== V2_MAX) {
    throw new Error(`${ID} scene: v1 served ${sim.v1Total} and v2 served ${sim.v2Total}`);
  }
  if (sim.errorTotal !== 3) {
    throw new Error(`${ID} scene: ${sim.errorTotal} failed arrivals, the scene is about three`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-ff-${name}`, entry.value, entry.at);
  }
  // One caller is drawn twice — as a dot in the Users box and as a bucket in the
  // strip — and both carry the same state, so both are written at once.
  for (const user of USER_IDS) {
    const marks = qa(stage, `.ff-u--${user}`);
    for (const entry of sim.cells[user]) attr(tl, marks, 'data-ff-cell', entry.value, entry.at);
  }

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    // An assignment is drawn as the path it took, so a dot leaving the switch
    // already says which side it belongs to before it lands.
    if (plan.lane !== 'in') request.group.classList.add(`ff-to-${plan.lane}`);

    parkRequest(request, lane.x, lane.y);
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
      // A request reaching the switch is not a result yet: what it did is the
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

  // The stage is complete on the first frame: ten callers nothing has assigned,
  // no switch to assign them with, both paths standing, neither serving
  // anybody, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
