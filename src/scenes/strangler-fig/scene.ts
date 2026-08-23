import gsap from 'gsap';
import {
  ACL,
  CAPABILITIES,
  LEGACY_X,
  MIGRATED_W,
  NEW_SHIFT,
  NEW_WHOLE,
  NEW_X,
  RETIRED_SHIFT,
  RETIRED_STRIP,
  ROW_Y,
  SCENE_DURATION,
  STAGE_STATE,
  TOKEN_COUNT,
  X_LANE,
  X_LEGACY,
  X_NEW,
  Y_BOX,
  Y_CLIENT,
  Y_FORK,
  boxShape,
  slotY,
} from './stage';
import type { BoxShape, Capability } from './stage';
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
import { collapseAtInstant, collapseLast, createScheduler, pairInstant } from '../shared/simulation';
import { attr, fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Strangler Fig scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Almost nothing the reader counts is authored. The scene says only when each
 * request leaves the client and which path it asks for, and what the migration
 * plan does: when a capability is rebuilt in the new system, when its route is
 * pointed at a share of the new system or all of it, when the old copy is
 * removed, and when the old system is switched off. Everything else falls out
 * of one run over the whole 24 seconds: which system each request is routed to,
 * which route table row lights up, which capability box is working, how many
 * requests each side has served, how far the migration meter has moved, how
 * tall each box is and where its capabilities sit inside it, when the
 * anti-corruption layer has to translate, and when the failure that rolls a
 * route back happens.
 *
 * Routing is the one place worth spelling out, because a percentage is not a
 * coin toss here: a share is spent like a budget. Each request for a row adds
 * the row's share to that row's credit, and the first request that pushes the
 * credit to a whole one is the one that goes to the new system, which then pays
 * the whole one back. A tenth therefore sends exactly one request in ten and a
 * half sends every other one, and scrubbing to any instant gives the same
 * answer as playing to it.
 *
 * The three numbers the scene asserts rather than derives are the shape of the
 * work: the old system takes `SERVE_LEGACY` to answer, the new one takes
 * `SERVE_NEW`, and the new `orders` code has a defect that surfaces on the
 * `FAIL_ON_NEW_ORDERS`th request it serves. The rollback is derived from that
 * failure rather than scheduled.
 */

const ID = 'strangler-fig';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how long a leg takes -------------------------------------------------

/**
 * Client box down to the row that answers the request. Each row is further
 * down than the last, so each leg is longer: the three legs below add up to the
 * same `0.80` whichever row matched, which is what keeps a route change from
 * looking like a speed change.
 */
const TO_ROW: Record<Capability, number> = { customers: 0.26, orders: 0.32, reports: 0.38 };
/** How long the router holds a request while the row it matched lights up. */
const ROW_DWELL = 0.09;
/** The matched row down to the fork, which sits below the node. */
const ROW_TO_FORK: Record<Capability, number> = { customers: 0.21, orders: 0.15, reports: 0.09 };
/** Sideways onto the chosen lane, then down it into the box. */
const FORK = 0.1;
const TO_BOX = 0.14;
/** Everything above, which is the same for every request. */
const TO_SERVICE = 0.8;

/** The way back: out of the box, back onto the client lane, and home. */
const UP_BOX = 0.11;
const UP_FORK = 0.07;
const UP_CLIENT = 0.3;
const HOME = UP_BOX + UP_FORK + UP_CLIENT;

/** How long the path label takes to fade once the router has read it. */
const LABEL_FADE = 0.08;

// --- how long the work takes ----------------------------------------------

/** What each system costs to answer from. The new one is why it is being built. */
const SERVE_LEGACY = 0.22;
const SERVE_NEW = 0.16;

/** One translation across the anti-corruption layer, out and back. */
const ACL_OUT = 0.3;
const ACL_DWELL = 0.06;
const ACL_FADE = 0.2;

/** How long a box takes to grow or shrink, and how long switching off takes. */
const RESIZE = 0.5;
const RETIRE_TIME = 1.2;

// --- what the deployment does ---------------------------------------------

type PlanKind = 'build' | 'canary' | 'route' | 'retire' | 'decommission';

interface PlanStep {
  at: number;
  kind: PlanKind;
  cap?: Capability;
  /** Percentage of the row's traffic the new system takes, for a canary. */
  share?: number;
}

/**
 * The migration plan, which is the only thing about the deployment the scene
 * authors. `build` puts a capability in the new system, `canary` points a share
 * of its traffic there, `route` points all of it there, `retire` removes the old
 * copy, and `decommission` switches the old system off.
 */
const PLAN: PlanStep[] = [
  { at: 6.2, kind: 'build', cap: 'customers' },
  { at: 6.8, kind: 'route', cap: 'customers' },
  { at: 11.0, kind: 'retire', cap: 'customers' },
  { at: 12.2, kind: 'build', cap: 'orders' },
  { at: 12.2, kind: 'canary', cap: 'orders', share: 10 },
  { at: 14.2, kind: 'canary', cap: 'orders', share: 50 },
  { at: 17.0, kind: 'route', cap: 'orders' },
  { at: 17.8, kind: 'retire', cap: 'orders' },
  { at: 18.2, kind: 'build', cap: 'reports' },
  { at: 18.4, kind: 'route', cap: 'reports' },
  { at: 21.2, kind: 'decommission' },
];

/** The request the new `orders` code gets wrong, counted over the ones it serves. */
const FAIL_ON_NEW_ORDERS = 5;
/** How long after the failure is seen the route is pointed back at the old system. */
const ROLLBACK_DELAY = 0.16;

// --- what the client does -------------------------------------------------

interface RequestPlan {
  start: number;
  path: Capability;
}

const ask = (start: number, path: Capability): RequestPlan => ({ start, path });

/** A run of requests for one path, evenly spaced. */
const burst = (from: number, gap: number, count: number, path: Capability): RequestPlan[] =>
  Array.from({ length: count }, (_value, n) => ask(round(from + n * gap), path));

const REQUESTS: RequestPlan[] = [
  // Step 1: every route still points at the old system.
  ask(0.4, 'customers'),
  ask(1.2, 'orders'),
  ask(2.0, 'reports'),
  ask(2.8, 'customers'),
  ask(3.5, 'orders'),
  ask(4.2, 'reports'),
  // Step 2: customers has moved, the other two have not.
  ask(7.2, 'orders'),
  ask(8.0, 'customers'),
  ask(8.8, 'reports'),
  ask(9.6, 'customers'),
  ask(10.4, 'orders'),
  // Step 3: orders goes over a tenth at a time, then half, then back, then all.
  ...burst(12.6, 0.14, 10, 'orders'),
  ...burst(14.3, 0.1, 8, 'orders'),
  ...burst(16.3, 0.2, 3, 'orders'),
  ...burst(17.2, 0.25, 3, 'orders'),
  // Step 4: reports moves last, and everything is answered by the new system.
  ...burst(18.5, 0.15, 8, 'reports').map((item, index) => ({
    ...item,
    path: (['reports', 'customers', 'orders'] as const)[index % 3] ?? 'reports',
  })),
];

// --- what the simulation produces -----------------------------------------

/** One leg of something moving: where it goes, and how long it takes. */
interface Move {
  at: number;
  x: number;
  y: number;
  duration: number;
}

type Side = 'legacy' | 'new';

interface RequestOutcome {
  side: Side;
  moves: Move[];
  labelFadeAt: number;
  failed: boolean;
  markAt: number;
  homeAt: number;
}

interface TokenOutcome {
  moves: Move[];
  showAt: number;
  fadeAt: number;
}

interface AttrChange {
  at: number;
  key: string;
  name: string;
  value: string;
}

/** A box that changes shape: the old system shrinking, the new one growing. */
interface ShapeMove {
  at: number;
  from: BoxShape;
  to: BoxShape;
  duration: number;
}

/** A capability sliding up inside the old system as the ones above it go. */
interface SlideMove {
  at: number;
  from: number;
  to: number;
  duration: number;
}

interface Segment {
  from: number;
  to: number;
  vFrom: number;
  vTo: number;
}

interface Simulation {
  requests: RequestOutcome[];
  tokens: TokenOutcome[];
  attrs: AttrChange[];
  legacyBox: ShapeMove[];
  newBox: ShapeMove[];
  legacySlides: Record<Capability, SlideMove[]>;
  /** The old system's title dropping into the retired strip under the new box. */
  legacyDrop: SlideMove[];
  /** The new system's contents sliding left when it takes the whole floor. */
  newSlide: SlideMove[];
  migrated: Segment[];
  aclFade: { from: number; to: number } | null;
  cues: [number, SceneCue][];
  /** Highest reading each tally reaches, so the stage can be checked against it. */
  totals: { legacy: number; new: number };
}

// --- meters ---------------------------------------------------------------

/** How long the migration meter takes to move from one reading to the next. */
const METER_RISE = RESIZE;

/**
 * A step series turned into a curve: every change is a ramp, and the value
 * holds until the next one. The ramp is cut short when two changes land closer
 * together than it is long, so the curve never doubles back on itself.
 */
function stepCurve(series: readonly [number, number][], end: number, scale: number): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  let value = 0;
  series.forEach(([time, next], index) => {
    if (time > at) segments.push({ from: at, to: time, vFrom: value, vTo: value });
    const until = Math.min(round(time + METER_RISE), series[index + 1]?.[0] ?? end);
    segments.push({ from: time, to: until, vFrom: value, vTo: next });
    value = next;
    at = until;
  });
  if (at < end) segments.push({ from: at, to: end, vFrom: value, vTo: value });
  return segments.map((segment) => ({
    from: round(segment.from),
    to: round(segment.to),
    vFrom: round(segment.vFrom * scale),
    vTo: round(segment.vTo * scale),
  }));
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const requests: RequestOutcome[] = REQUESTS.map(() => ({
    side: 'legacy' as Side,
    moves: [],
    labelFadeAt: 0,
    failed: false,
    markAt: 0,
    homeAt: 0,
  }));
  const tokens: TokenOutcome[] = Array.from({ length: TOKEN_COUNT }, () => ({
    moves: [],
    showAt: 0,
    fadeAt: 0,
  }));
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];

  const setAttr = (at: number, key: string, name: string, value: string): void => {
    raw.push({ at: round(at), key, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };
  const move = (
    target: { moves: Move[] },
    at: number,
    x: number,
    y: number,
    duration: number,
  ): void => {
    collapseLast(target.moves, { at: round(at), x, y, duration }, (item) => item.at);
  };

  const { schedule, drain } = createScheduler();

  // --- the route table ----------------------------------------------------

  /** Where each row points, and what share of it the new system is taking. */
  const target: Record<Capability, Side> = {
    customers: 'legacy',
    orders: 'legacy',
    reports: 'legacy',
  };
  const share: Record<Capability, number> = { customers: 0, orders: 0, reports: 0 };
  /** Credit a row has built up towards sending one request to the new system. */
  const credit: Record<Capability, number> = { customers: 0, orders: 0, reports: 0 };
  /**
   * How many times a row has been changed. The new code has to translate the
   * first request it sees under a route it has not served before.
   */
  const version: Record<Capability, number> = { customers: 0, orders: 0, reports: 0 };
  /** Rows that have carried a share, which are the only ones a share can end. */
  const wasCanary: Record<Capability, boolean> = {
    customers: false,
    orders: false,
    reports: false,
  };
  const translated: Record<Capability, number> = { customers: -1, orders: -1, reports: -1 };

  /** How many requests are standing on each row, so it lights while any is. */
  const onRow: Record<Capability, number> = { customers: 0, orders: 0, reports: 0 };
  const matchRow = (at: number, name: Capability, delta: number): void => {
    onRow[name] += delta;
    setAttr(at, `row-${name}`, 'data-match', onRow[name] > 0 ? 'on' : 'off');
  };

  // --- the two systems ----------------------------------------------------

  /** Capabilities the old system still holds, in the order they are drawn. */
  const inLegacy: Capability[] = [...CAPABILITIES];
  const inNew: Capability[] = [];
  let retired = false;

  const legacyBox: ShapeMove[] = [];
  const newBox: ShapeMove[] = [];
  const legacySlides: Record<Capability, SlideMove[]> = {
    customers: [],
    orders: [],
    reports: [],
  };
  const legacyDrop: SlideMove[] = [];
  const newSlide: SlideMove[] = [];
  const migratedBar: [number, number][] = [];

  /** How many requests each system has answered, which is what the tallies read. */
  const served: Record<Side, number> = { legacy: 0, new: 0 };

  /** How many requests are inside each capability box, so it lights while any is. */
  const busy = new Map<string, number>();
  const setBusy = (at: number, side: Side, name: Capability, delta: number): void => {
    const key = `${side}-${name}`;
    const next = (busy.get(key) ?? 0) + delta;
    busy.set(key, next);
    setAttr(at, key, 'data-busy', next > 0 ? 'on' : 'off');
  };

  /** Where a capability sits inside the old system, counted from its title. */
  const legacySlot = (name: Capability): number => inLegacy.indexOf(name);

  // --- the anti-corruption layer ------------------------------------------

  let nextToken = 0;
  let aclUp = false;

  /** Sends one translation from the new system to the old one and back. */
  const translate = (at: number): void => {
    const outcome = tokens[nextToken];
    if (!outcome) return;
    nextToken += 1;
    outcome.showAt = round(at);
    move(outcome, at, ACL.xLegacy, ACL.y, ACL_OUT);
    const backAt = round(at + ACL_OUT + ACL_DWELL);
    move(outcome, backAt, ACL.xNew, ACL.y, ACL_OUT);
    outcome.fadeAt = round(backAt + ACL_OUT);
  };

  // --- the migration plan --------------------------------------------------

  for (const step of PLAN) {
    schedule(step.at, () => {
      const at = step.at;
      const name = step.cap;

      if (step.kind === 'build' && name) {
        inNew.push(name);
        setAttr(at, `new-${name}`, 'data-mod', 'live');
        newBox.push({
          at,
          from: boxShape(NEW_X, inNew.length - 1),
          to: boxShape(NEW_X, inNew.length),
          duration: RESIZE,
        });
        if (!aclUp) {
          aclUp = true;
          setAttr(at, 'stage', 'data-acl', 'on');
        }
        cue(at, 'state');
        return;
      }

      if (step.kind === 'canary' && name) {
        share[name] = step.share ?? 0;
        wasCanary[name] = true;
        version[name] += 1;
        setAttr(at, `row-${name}`, 'data-pct', String(step.share ?? 0));
        cue(at, 'state');
        return;
      }

      if (step.kind === 'route' && name) {
        target[name] = 'new';
        share[name] = 100;
        version[name] += 1;
        setAttr(at, `row-${name}`, 'data-target', 'new');
        // A row only carries a share once it has been served one; a route that
        // was flipped outright never had a percentage to finish at.
        if (wasCanary[name]) setAttr(at, `row-${name}`, 'data-pct', '100');
        // The old copy is still there, but nothing reaches it any more.
        setAttr(at, `legacy-${name}`, 'data-mod', 'retired');
        setAttr(at, 'stage', 'data-rollback', 'off');
        cue(at, 'trip');
        return;
      }

      if (step.kind === 'retire' && name) {
        const index = legacySlot(name);
        if (index < 0) return;
        inLegacy.splice(index, 1);
        setAttr(at, `legacy-${name}`, 'data-mod', 'gone');
        // Everything below the gap slides up into it.
        inLegacy.forEach((other, slot) => {
          const from = CAPABILITIES.indexOf(other);
          const trail = legacySlides[other];
          const wasAt = trail.length > 0 ? (trail[trail.length - 1]?.to ?? 0) : 0;
          const to = slotY(slot) - slotY(from);
          if (to !== wasAt) {
            trail.push({ at, from: wasAt, to, duration: RESIZE });
          }
        });
        legacyBox.push({
          at,
          from: boxShape(LEGACY_X, inLegacy.length + 1),
          to: boxShape(LEGACY_X, inLegacy.length),
          duration: RESIZE,
        });
        collapseLast<[number, number]>(
          migratedBar,
          [round(at), (CAPABILITIES.length - inLegacy.length) / CAPABILITIES.length],
          pairInstant,
        );
        setAttr(at, 'stage', 'data-migrated', String(CAPABILITIES.length - inLegacy.length));
        cue(at, 'state');
        return;
      }

      if (step.kind === 'decommission') {
        retired = true;
        // Whatever is left of the old system goes at once.
        for (const other of [...inLegacy]) {
          setAttr(at, `legacy-${other}`, 'data-mod', 'gone');
        }
        legacyBox.push({
          at,
          from: boxShape(LEGACY_X, inLegacy.length),
          to: RETIRED_STRIP,
          duration: RETIRE_TIME,
        });
        legacyDrop.push({ at, from: 0, to: RETIRED_SHIFT, duration: RETIRE_TIME });
        newBox.push({
          at,
          from: boxShape(NEW_X, inNew.length),
          to: NEW_WHOLE,
          duration: RETIRE_TIME,
        });
        newSlide.push({ at, from: 0, to: -NEW_SHIFT, duration: RETIRE_TIME });
        inLegacy.length = 0;
        collapseLast<[number, number]>(migratedBar, [round(at), 1], pairInstant);
        setAttr(at, 'stage', 'data-migrated', String(CAPABILITIES.length));
        setAttr(at, 'stage', 'data-acl', 'off');
        setAttr(at, 'stage', 'data-retired', 'on');
        cue(at, 'trip');
      }
    });
  }

  // --- one request at a time ----------------------------------------------

  /** Requests the new `orders` code has answered, which is where its defect is. */
  let newOrders = 0;

  REQUESTS.forEach((plan, index) => {
    const outcome = requests[index];
    if (!outcome) return;
    const { start, path } = plan;

    schedule(start, () => {
      // The router decides on the way past, with the table as it stands now. A
      // share is spent as credit rather than tossed for, so the split is the
      // same whichever way the reader scrubbed to get here.
      let side: Side = 'legacy';
      if (target[path] === 'new') {
        side = 'new';
      } else if (share[path] > 0) {
        credit[path] = round(credit[path] + share[path] / 100);
        if (credit[path] >= 1) {
          credit[path] = round(credit[path] - 1);
          side = 'new';
        }
      }
      outcome.side = side;
      const lane = side === 'legacy' ? X_LEGACY : X_NEW;

      const rowAt = round(start + TO_ROW[path]);
      const leaveRowAt = round(rowAt + ROW_DWELL);
      const forkAt = round(leaveRowAt + ROW_TO_FORK[path]);
      const laneAt = round(forkAt + FORK);
      const arriveAt = round(start + TO_SERVICE);

      move(outcome, start, X_LANE, ROW_Y[path], TO_ROW[path]);
      move(outcome, leaveRowAt, X_LANE, Y_FORK, ROW_TO_FORK[path]);
      move(outcome, forkAt, lane, Y_FORK, FORK);
      move(outcome, laneAt, lane, Y_BOX, TO_BOX);
      outcome.labelFadeAt = forkAt;

      schedule(rowAt, () => matchRow(rowAt, path, 1));
      schedule(leaveRowAt, () => matchRow(leaveRowAt, path, -1));

      schedule(arriveAt, () => {
        served[side] += 1;
        setAttr(arriveAt, 'stage', `data-${side}-count`, String(served[side]));
        setBusy(arriveAt, side, path, 1);

        // The new code has to translate whatever it does not own yet, and it
        // has to do it again the first time it serves a route it has not seen.
        if (side === 'new' && inLegacy.includes(path) && translated[path] !== version[path]) {
          translated[path] = version[path];
          translate(arriveAt);
        }

        const serviceTime = side === 'legacy' ? SERVE_LEGACY : SERVE_NEW;
        const markAt = round(arriveAt + serviceTime);
        let failed = false;
        if (side === 'new' && path === 'orders') {
          newOrders += 1;
          failed = newOrders === FAIL_ON_NEW_ORDERS;
        }

        schedule(markAt, () => {
          setBusy(markAt, side, path, -1);
          outcome.failed = failed;
          outcome.markAt = markAt;
          outcome.homeAt = round(markAt + HOME);
          move(outcome, markAt, lane, Y_FORK, UP_BOX);
          move(outcome, round(markAt + UP_BOX), X_LANE, Y_FORK, UP_FORK);
          move(outcome, round(markAt + UP_BOX + UP_FORK), X_LANE, Y_CLIENT, UP_CLIENT);
          if (failed) {
            cue(markAt, 'failure');
            // A route is configuration, so the way back is to point it at the
            // old system again rather than to undo a deployment.
            const rollbackAt = round(markAt + ROLLBACK_DELAY);
            schedule(rollbackAt, () => {
              if (retired) return;
              target[path] = 'legacy';
              share[path] = 0;
              credit[path] = 0;
              version[path] += 1;
              setAttr(rollbackAt, `row-${path}`, 'data-target', 'legacy');
              setAttr(rollbackAt, `row-${path}`, 'data-pct', 'off');
              setAttr(rollbackAt, 'stage', 'data-rollback', 'on');
              cue(rollbackAt, 'trip');
            });
          } else {
            cue(outcome.homeAt, 'success');
          }
        });
      });
    });
  });

  drain();

  const migrated = stepCurve(migratedBar, SCENE_DURATION, MIGRATED_W);

  // The layer thins out over the last capability's data, and goes with the box.
  const aclFade = { from: 18.6, to: 21.0 };

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.key}@${change.name}`);
  }

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const id = `${change.key}@${change.name}`;
    if (seen.get(id) === change.value) continue;
    seen.set(id, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);
  // Two plan steps can land on one instant, and the same sound twice over one
  // frame is a click rather than a cue.
  const heard: [number, SceneCue][] = [];
  for (const entry of cues) {
    const last = heard[heard.length - 1];
    if (last && last[0] === entry[0] && last[1] === entry[1]) continue;
    heard.push(entry);
  }

  return {
    requests,
    tokens,
    attrs,
    legacyBox,
    newBox,
    legacySlides,
    legacyDrop,
    newSlide,
    migrated,
    aclFade,
    cues: heard,
    totals: { legacy: served.legacy, new: served.new },
  };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (const name of CAPABILITIES) {
    targets[`row-${name}`] = q<SVGGElement>(stage, `.sf-row--${name}`, ID);
    targets[`legacy-${name}`] = q<SVGGElement>(stage, `.sf-mod--legacy-${name}`, ID);
    targets[`new-${name}`] = q<SVGGElement>(stage, `.sf-mod--new-${name}`, ID);
  }

  const legacyBoxEl = q<SVGRectElement>(stage, '.sf-legacy-box', ID);
  const newBoxEl = q<SVGRectElement>(stage, '.sf-new-box', ID);
  const legacyContent = q<SVGGElement>(stage, '.sf-legacy-content', ID);
  const newContent = q<SVGGElement>(stage, '.sf-new-content', ID);
  const migratedFill = q<SVGRectElement>(stage, '.sf-migrated-fill', ID);
  const aclFadeEl = q<SVGGElement>(stage, '.sf-acl-fade', ID);
  const tokenEls = Array.from({ length: TOKEN_COUNT }, (_value, n) =>
    q<SVGGElement>(stage, `.sf-token--${n + 1}`, ID),
  );
  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);

  const sim = simulate();
  const parts = mountRequests(requestLayer, REQUESTS.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const element = targets[change.key];
    if (!element) continue;
    attr(tl, element, change.name, change.value, change.at);
  }

  // --- the two systems changing size --------------------------------------

  const reshape = (element: Element, steps: readonly ShapeMove[]): void => {
    for (const step of steps) {
      tl.fromTo(
        element,
        {
          attr: {
            x: step.from.x,
            y: step.from.y,
            width: step.from.width,
            height: step.from.height,
          },
        },
        {
          attr: { x: step.to.x, y: step.to.y, width: step.to.width, height: step.to.height },
          duration: step.duration,
          ease: 'power2.inOut',
          immediateRender: false,
        },
        step.at,
      );
    }
  };
  reshape(legacyBoxEl, sim.legacyBox);
  reshape(newBoxEl, sim.newBox);

  const slide = (element: Element, steps: readonly SlideMove[], axis: 'x' | 'y'): void => {
    for (const step of steps) {
      const from = axis === 'x' ? { x: step.from } : { y: step.from };
      const to = axis === 'x' ? { x: step.to } : { y: step.to };
      tl.fromTo(
        element,
        from,
        { ...to, duration: step.duration, ease: 'power2.inOut', immediateRender: false },
        step.at,
      );
    }
  };
  for (const name of CAPABILITIES) {
    slide(q<SVGGElement>(stage, `.sf-mod--legacy-${name}`, ID), sim.legacySlides[name], 'y');
  }
  slide(legacyContent, sim.legacyDrop, 'y');
  slide(newContent, sim.newSlide, 'x');

  // --- the migration meter ------------------------------------------------

  for (const segment of sim.migrated) {
    if (segment.to <= segment.from || segment.vFrom === segment.vTo) continue;
    tl.fromTo(
      migratedFill,
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

  // --- the anti-corruption layer ------------------------------------------

  if (sim.aclFade) {
    tl.fromTo(
      aclFadeEl,
      { opacity: 1 },
      {
        opacity: 0.3,
        duration: sim.aclFade.to - sim.aclFade.from,
        ease: 'none',
        immediateRender: false,
      },
      sim.aclFade.from,
    );
  }

  sim.tokens.forEach((item, index) => {
    const element = tokenEls[index];
    if (!element) return;
    gsap.set(element, { x: ACL.xNew, y: ACL.y, opacity: 0 });
    if (item.moves.length === 0) return;
    tl.set(element, { opacity: 1, immediateRender: false }, item.showAt);
    for (const step of item.moves) {
      tl.to(
        element,
        { x: step.x, y: step.y, duration: step.duration, ease: 'none', immediateRender: false },
        step.at,
      );
    }
    tl.to(element, { opacity: 0, duration: ACL_FADE, immediateRender: false }, item.fadeAt);
  });

  // --- requests -----------------------------------------------------------

  REQUESTS.forEach((plan, index) => {
    const item = parts[index];
    const outcome = sim.requests[index];
    if (!item || !outcome) return;

    parkRequest(item, X_LANE, Y_CLIENT);
    item.group.setAttribute('data-side', outcome.side);
    // The path is what the router reads, so it travels with the request and is
    // spent once the router has read it.
    const label = attachToRequest(
      item,
      'text',
      { class: 'sf-req-path', x: '-36', y: '8', 'text-anchor': 'end' },
      `/${plan.path}`,
    );
    gsap.set(label, { opacity: 1 });

    showRequest(tl, item, plan.start);

    for (const step of outcome.moves) {
      tl.to(
        item.group,
        { x: step.x, y: step.y, duration: step.duration, ease: 'none', immediateRender: false },
        step.at,
      );
    }

    tl.to(label, { opacity: 0, duration: LABEL_FADE, immediateRender: false }, outcome.labelFadeAt);

    markRequest(tl, item, outcome.failed ? 'fail' : 'ok', outcome.markAt);
    if (outcome.failed) haloRequest(tl, item, outcome.markAt, outcome.homeAt, 0.2);
    hideRequest(tl, item, outcome.homeAt, fadeAt(outcome.homeAt, SCENE_DURATION));
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: three routes all pointing at the
  // old system, three capabilities inside it, an empty new system beside it,
  // and a migration meter at nothing.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
