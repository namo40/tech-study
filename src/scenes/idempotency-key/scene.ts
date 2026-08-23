import {
  AMOUNTS,
  type Amount,
  LABEL_DY,
  RECEIPT_COUNT,
  ROW_COUNT,
  SCENE_DURATION,
  STAGE_STATE,
  type StoreKey,
  X_LANE,
  X_WAIT,
  Y_API,
  Y_CLIENT,
  Y_PAY,
  Y_WAIT,
} from './stage';
import gsap from 'gsap';
import { q, qa } from '../shared/dom';
import {
  attachToRequest,
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
  type RequestResult,
} from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, fadeAt, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Idempotency-Key scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene says only when each POST
 * leaves the client, which key it carries, which amount is in its body, whether
 * its response is lost on the way back, and which earlier request it is a retry
 * of. Everything else falls out of one run over the whole 24 seconds: which row
 * of the store each key lands in, whether a lookup is a miss, a hit, a claim
 * somebody else is holding or a key reused with a different body, how many
 * charges actually happened and therefore how many receipts the Payments box
 * shows, when a row expires, and when the client is shown retrying.
 *
 * Three things are worth spelling out.
 *
 * The store is the whole argument. A request without a key cannot be recognised
 * on the way back, so its retry charges again; a request with a key claims a row
 * before the work starts and the row is what every later request is answered
 * from. The row is claimed on the way down and completed on the way back up,
 * which is exactly the window a second request can arrive in.
 *
 * What a second claim gets is a policy, not a per request decision. Before
 * `POLICY_409_FROM` the store parks the second request until the row is done and
 * then hands it the same answer; after it, the store answers 409 straight away
 * and lets the client ask again. Both are correct, and the scene shows them on
 * the same key rather than on two different ones.
 *
 * Lifetime is derived too. A row lives `TTL_LIFE` scene seconds from the moment
 * it is claimed, so nothing schedules an expiry: the only row old enough to run
 * out before the scene ends is the one claimed in step 2, which is why the key
 * that already answered a retry can be claimed again as a new request.
 */

const ID = 'idempotency-key';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how long a leg takes -------------------------------------------------

/** A request travelling down: Client to API, and API to Payments. */
const DOWN = 0.5;
/** An answer travelling up: Payments to API, and API to Client. */
const UP = 0.4;
/** How long a charge takes at the Payments box before the answer turns around. */
const DWELL = 0.1;
/** How long the API holds a request it is answering itself. */
const TURN = 0.1;
/** The step sideways onto the waiting spot, and back onto the lane. */
const PARK = 0.15;
/** How far up the last leg a lost response gets before it disperses. */
const LOST_AT = 0.75;
/** How long a lost response takes to disperse. */
const LOST_FADE = 0.3;

// --- how long a state stays on --------------------------------------------

/** How long the lookup result stays on the stage. */
const FLASH_HOLD = 0.6;
/** How long a row stays lit after it is read. */
const ROW_LIT = 0.5;
/** How long the client shows that it is sending the same POST again. */
const RETRY_HOLD = 0.9;
/** How long after a double charge is home the counter starts complaining. */
const ALARM_LAG = 0.3;
/** How long a row takes to fade out once it has run out of time. */
const TTL_FADE = 0.8;
/** How long before it sends that the client shows the body it is about to send. */
const AMOUNT_LEAD = 0.2;

// --- what the scene is told -----------------------------------------------

interface RequestPlan {
  /** When the POST leaves the client. */
  start: number;
  /** The `Idempotency-Key` header it carries, when it carries one. */
  key?: StoreKey;
  /** The body, which is what the key is scoped to. */
  amount: Amount;
  /** The answer never reaches the client. */
  lost?: boolean;
  /** This is the client sending request `n` again. */
  retryOf?: number;
}

const REQUESTS: RequestPlan[] = [
  // Step 1: no key at all, so a lost answer turns into a second charge.
  { start: 0.5, amount: 40, lost: true },
  { start: 3.0, amount: 40, retryOf: 0 },
  // Step 2: the same pair of requests, both carrying the same key.
  { start: 6.5, key: 'a1f3', amount: 40, lost: true },
  { start: 9.0, key: 'a1f3', amount: 40, retryOf: 2 },
  // Step 3: a double click, twice, on two different keys.
  { start: 12.4, key: 'b7c2', amount: 40 },
  { start: 12.5, key: 'b7c2', amount: 40 },
  { start: 15.1, key: 'c9d4', amount: 40 },
  { start: 15.2, key: 'c9d4', amount: 40 },
  // Step 4: the key from step 2 with a different body, then again after it has
  // run out of time.
  { start: 18.5, key: 'a1f3', amount: 90 },
  { start: 20.5, key: 'a1f3', amount: 90 },
];

/**
 * What a step clears when it opens. The counter and the receipts are what the
 * reader is asked to compare, so each step starts them from nothing; the store
 * is only emptied once, because step 4 is about a key step 2 left behind.
 */
const RESETS: { at: number; store: boolean }[] = [
  { at: 6, store: true },
  { at: 12, store: false },
];

/** When the store stops parking a second claim and answers 409 instead. */
const POLICY_409_FROM = 14.5;

/**
 * How long a row lives, in scene seconds. The label on the stage says 24 hours,
 * which is what a real store would be set to; here it is the one number that
 * decides which row runs out before the scene ends.
 */
const TTL_LIFE = 13;

// --- what the run produces ------------------------------------------------

interface AttrChange {
  at: number;
  key: string;
  name: string;
  value: string;
}

interface Leg {
  at: number;
  duration: number;
  x?: number;
  y?: number;
}

/** A row fading out as it runs out of time, and being put back afterwards. */
interface RowFade {
  key: string;
  at: number;
  duration: number;
  to: number;
}

interface Journey {
  start: number;
  legs: Leg[];
  marks: [number, RequestResult][];
  /** The key it holds, and the window it is holding it in front of the reader. */
  key?: StoreKey;
  keyFrom: number;
  keyTo: number;
  /** The status code it is bringing back, when it is bringing one back. */
  code?: string;
  codeFrom: number;
  /** When the answer disperses, for a response that never arrives. */
  lost?: number;
  /** When it stops being on the stage. */
  endAt: number;
}

interface Run {
  attrs: AttrChange[];
  fades: RowFade[];
  journeys: Journey[];
  cues: [number, SceneCue][];
}

/** One row of the store, while it holds a claim. */
interface Row {
  key: StoreKey;
  body: Amount;
  status: 'progress' | 'done';
  /** Identifies this claim, so an expiry booked for an older one is ignored. */
  claimedAt: number;
}

/**
 * Runs the whole scene once.
 *
 * A keyed request claims the lowest free row on its way down and completes that
 * row on its way back up. Anything arriving in between is answered from the row
 * rather than from the Payments box, which is the only reason the charge counter
 * ever stays still while requests keep coming.
 */
function simulate(): Run {
  const attrs: AttrChange[] = [];
  const fades: RowFade[] = [];
  const cues: [number, SceneCue][] = [];
  const flashes: [number, string][] = [];
  const journeys: Journey[] = REQUESTS.map((plan) => ({
    start: plan.start,
    legs: [],
    marks: [],
    key: plan.key,
    keyFrom: plan.start,
    keyTo: plan.start,
    codeFrom: plan.start,
    endAt: plan.start,
  }));

  const rows: (Row | null)[] = Array.from({ length: ROW_COUNT }, () => null);
  /** Requests parked against a row, waiting for the claim on it to finish. */
  const waiting: number[][] = Array.from({ length: ROW_COUNT }, () => []);
  /** Requests that made the Payments box move, so a retry of one is a duplicate. */
  const charging = new Set<number>();
  let charged = 0;
  let shown: Amount = AMOUNTS[0];
  let duplicate: number | null = null;

  const { schedule, drain } = createScheduler();

  const set = (at: number, key: string, name: string, value: string): void => {
    if (at > SCENE_DURATION || at < 0) return;
    collapseAtInstant(
      attrs,
      { at: round(at), key, name, value },
      (change) => `${change.key}@${change.name}`,
    );
  };

  const cue = (at: number, name: SceneCue): void => {
    if (at > SCENE_DURATION || at < 0) return;
    cues.push([round(at), name]);
  };

  const flash = (at: number, name: string): void => {
    if (at > SCENE_DURATION) return;
    flashes.push([round(at), name]);
  };

  // --- the Payments box ---------------------------------------------------

  const charge = (at: number, index: number): void => {
    const plan = REQUESTS[index];
    charging.add(index);
    charged += 1;
    set(at, 'stage', 'data-charged', String(charged));
    if (charged <= RECEIPT_COUNT) set(at, `receipt-${charged - 1}`, 'data-receipt', 'on');
    // A charge is only wrong when it is the second one for the same intent.
    if (plan?.retryOf !== undefined && charging.has(plan.retryOf)) {
      duplicate = index;
      cue(at, 'failure');
    }
  };

  // --- the store ----------------------------------------------------------

  const claim = (slot: number, at: number, index: number): void => {
    const plan = REQUESTS[index];
    if (slot < 0 || !plan?.key) return;
    const claimedAt = round(at);
    rows[slot] = { key: plan.key, body: plan.amount, status: 'progress', claimedAt };
    set(at, `row-${slot}`, 'data-row', 'progress');
    set(at, `row-${slot}`, 'data-key', plan.key);
    set(at, `row-${slot}`, 'data-body', 'none');
    cue(at, 'state');

    // Nothing books an expiry: every claim gets the same lifetime, and only the
    // ones old enough to run out inside the scene are ever seen doing it.
    const expiry = round(claimedAt + TTL_LIFE);
    schedule(expiry, () => {
      const row = rows[slot];
      if (!row || row.claimedAt !== claimedAt || expiry > SCENE_DURATION) return;
      rows[slot] = null;
      fades.push({ key: `row-${slot}`, at: round(expiry - TTL_FADE), duration: TTL_FADE, to: 0 });
      set(expiry, `row-${slot}`, 'data-row', 'empty');
      set(expiry, `row-${slot}`, 'data-key', 'none');
      set(expiry, `row-${slot}`, 'data-body', 'none');
      // Put the row back at full strength once there is nothing in it to see,
      // so the next claim on that slot starts from a row that is there.
      fades.push({ key: `row-${slot}`, at: round(expiry + 0.05), duration: 0, to: 1 });
      cue(expiry, 'trip');
    });
  };

  const complete = (slot: number, at: number, index: number): void => {
    const row = rows[slot];
    const plan = REQUESTS[index];
    if (!row || !plan) return;
    row.status = 'done';
    row.body = plan.amount;
    set(at, `row-${slot}`, 'data-row', 'done');
    set(at, `row-${slot}`, 'data-body', String(plan.amount));
    cue(at, 'state');

    // Whoever was parked against this row is answered from it, in one move.
    const parked = waiting[slot] ?? [];
    for (const other of parked.splice(0)) {
      const journey = journeys[other];
      if (!journey) continue;
      journey.keyTo = round(at);
      journey.legs.push({ at, duration: PARK / 2, x: X_LANE });
      journey.legs.push({ at: round(at + PARK / 2), duration: PARK / 2, y: Y_API });
      journey.marks.push([round(at + PARK), 'ok']);
      journey.legs.push({ at: round(at + PARK), duration: UP, y: Y_CLIENT });
      const home = round(at + PARK + UP);
      journey.endAt = home;
      cue(home, 'success');
    }
  };

  // --- one request --------------------------------------------------------

  /** The last leg home, and what the client hears when the answer lands. */
  const goHome = (index: number, at: number, result: RequestResult): void => {
    const plan = REQUESTS[index];
    const journey = journeys[index];
    if (!plan || !journey) return;
    journey.legs.push({ at, duration: UP, y: Y_CLIENT });
    const home = round(at + UP);
    if (plan.lost) {
      // The charge happened; the answer is what went missing.
      const lostAt = round(at + UP * LOST_AT);
      journey.lost = lostAt;
      journey.endAt = lostAt;
      cue(lostAt, 'failure');
      return;
    }
    journey.endAt = home;
    cue(home, result === 'ok' ? 'success' : 'failure');
    if (duplicate === index) set(round(home + ALARM_LAG), 'stage', 'data-alarm', 'on');
  };

  /** Down to the Payments box, and back up through the row it claimed. */
  const toPayments = (index: number, from: number, slot: number): void => {
    const journey = journeys[index];
    if (!journey) return;
    journey.legs.push({ at: from, duration: DOWN, y: Y_PAY });
    const atPay = round(from + DOWN);
    schedule(atPay, () => {
      charge(atPay, index);
      const leaves = round(atPay + DWELL);
      journey.marks.push([leaves, 'ok']);
      journey.legs.push({ at: leaves, duration: UP, y: Y_API });
      const back = round(leaves + UP);
      schedule(back, () => {
        if (slot >= 0) complete(slot, back, index);
        goHome(index, back, 'ok');
      });
    });
  };

  /** An answer the API produced by itself, with nothing behind it. */
  const answerHere = (index: number, at: number, result: RequestResult, code?: string): void => {
    const journey = journeys[index];
    if (!journey) return;
    const leaves = round(at + TURN);
    journey.marks.push([leaves, result]);
    if (code) {
      journey.code = code;
      journey.codeFrom = leaves;
    }
    goHome(index, leaves, result);
  };

  const atApi = (index: number): void => {
    const plan = REQUESTS[index];
    const journey = journeys[index];
    if (!plan || !journey) return;
    const at = round(plan.start + DOWN);

    // No key: the API has nothing to recognise the request by, so every arrival
    // is a new order.
    if (!plan.key) {
      toPayments(index, at, -1);
      return;
    }

    // The key has been read, so the request stops showing it.
    journey.keyTo = at;

    const slot = rows.findIndex((row) => row?.key === plan.key);
    if (slot < 0) {
      flash(at, 'miss');
      const free = rows.findIndex((row) => row === null);
      claim(free, at, index);
      toPayments(index, at, free);
      return;
    }

    const row = rows[slot];
    if (!row) return;

    if (row.status === 'progress') {
      flash(at, 'progress');
      if (at < POLICY_409_FROM) {
        // Somebody else is holding the claim, so this one stands still until the
        // row it is waiting on is finished, and keeps its key while it waits.
        journey.keyTo = round(at + PARK + TTL_LIFE);
        // Down first, then across. A diagonal would carry the key label
        // through the corner of the flash the lookup has just lit.
        journey.legs.push({ at, duration: PARK / 2, y: Y_WAIT });
        journey.legs.push({ at: round(at + PARK / 2), duration: PARK / 2, x: X_WAIT });
        waiting[slot]?.push(index);
        cue(at, 'state');
        return;
      }
      cue(at, 'trip');
      answerHere(index, at, 'fail', '409');
      return;
    }

    if (row.body === plan.amount) {
      // The key is known and the body is the one it was claimed with, so the
      // stored answer goes back up without the Payments box being touched.
      flash(at, 'hit');
      set(at, `row-${slot}`, 'data-row', 'hit');
      set(round(at + ROW_LIT), `row-${slot}`, 'data-row', 'done');
      cue(at, 'state');
      answerHere(index, at, 'ok');
      return;
    }

    // Same key, a different body: the key belongs to the request it was first
    // used for, and this is not that request.
    set(at, `row-${slot}`, 'data-row', 'clash');
    set(round(at + ROW_LIT), `row-${slot}`, 'data-row', 'done');
    cue(at, 'trip');
    answerHere(index, at, 'fail', '422');
  };

  const depart = (index: number): void => {
    const plan = REQUESTS[index];
    const journey = journeys[index];
    if (!plan || !journey) return;

    // The client shows the body it is about to send, so the reader can see the
    // one place in the scene where two requests differ by more than their time.
    if (plan.amount !== shown) {
      shown = plan.amount;
      const at = round(plan.start - AMOUNT_LEAD);
      set(at, 'stage', 'data-amount', String(plan.amount));
      cue(at, 'state');
    }
    if (plan.retryOf !== undefined) {
      set(plan.start, 'stage', 'data-retry', 'on');
      set(round(plan.start + RETRY_HOLD), 'stage', 'data-retry', 'off');
      cue(plan.start, 'trip');
    }

    journey.legs.push({ at: plan.start, duration: DOWN, y: Y_API });
    schedule(round(plan.start + DOWN), () => atApi(index));
  };

  REQUESTS.forEach((plan, index) => schedule(plan.start, () => depart(index)));

  for (const reset of RESETS) {
    schedule(reset.at, () => {
      charged = 0;
      charging.clear();
      duplicate = null;
      set(reset.at, 'stage', 'data-charged', '0');
      set(reset.at, 'stage', 'data-alarm', 'off');
      for (let index = 0; index < RECEIPT_COUNT; index += 1) {
        set(reset.at, `receipt-${index}`, 'data-receipt', 'off');
      }
      if (!reset.store) return;
      for (let slot = 0; slot < ROW_COUNT; slot += 1) {
        rows[slot] = null;
        waiting[slot] = [];
        set(reset.at, `row-${slot}`, 'data-row', 'empty');
        set(reset.at, `row-${slot}`, 'data-key', 'none');
        set(reset.at, `row-${slot}`, 'data-body', 'none');
      }
    });
  }

  drain();

  // The lookup result is one label, so a result that lands while an earlier one
  // is still up cuts the earlier one short rather than fighting it.
  flashes.sort((left, right) => left[0] - right[0]);
  flashes.forEach(([at, name], index) => {
    set(at, 'stage', 'data-flash', name);
    const next = flashes[index + 1];
    const until = Math.min(at + FLASH_HOLD, next ? next[0] : Number.POSITIVE_INFINITY);
    set(until, 'stage', 'data-flash', 'none');
  });

  // Same instant, same element: keep the change that ends up applying, then
  // drop anything that writes a value the stage already holds.
  attrs.sort((left, right) => left.at - right.at);
  const applied = new Map<string, string>();
  const folded: AttrChange[] = [];
  for (let i = 0; i < attrs.length; i += 1) {
    const change = attrs[i];
    if (!change) continue;
    const id = `${change.key}@${change.name}`;
    const next = attrs[i + 1];
    if (next && next.at === change.at && `${next.key}@${next.name}` === id) continue;
    const held = applied.get(id) ?? STAGE_STATE[id];
    if (held === change.value) continue;
    applied.set(id, change.value);
    folded.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);
  const heard: [number, SceneCue][] = [];
  for (const entry of cues) {
    const previous = heard[heard.length - 1];
    if (previous && previous[0] === entry[0] && previous[1] === entry[1]) continue;
    heard.push(entry);
  }

  return { attrs: folded, fades, journeys, cues: heard };
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const requestLayer = q<SVGGElement>(stage, '.scene-requests', ID);
  const targets: Record<string, Element> = { stage };
  qa<SVGGElement>(stage, '.ik-row').forEach((element, index) => {
    targets[`row-${index}`] = element;
  });
  qa<SVGGElement>(stage, '.ik-receipt').forEach((element, index) => {
    targets[`receipt-${index}`] = element;
  });

  const sim = simulate();
  const requests = mountRequests(requestLayer, REQUESTS.length, ID);
  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const target = targets[change.key];
    if (target) attr(tl, target, change.name, change.value, change.at);
  }

  // --- a row running out of time ------------------------------------------

  for (const fade of sim.fades) {
    const target = targets[fade.key];
    if (!target) continue;
    if (fade.duration <= 0) {
      tl.set(target, { opacity: fade.to, immediateRender: false }, fade.at);
      continue;
    }
    tl.to(target, { opacity: fade.to, duration: fade.duration, ease: 'none' }, fade.at);
  }

  // --- requests -----------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const parts = requests[index];
    if (!parts) return;
    parkRequest(parts, X_LANE, Y_CLIENT);
    parts.group.setAttribute('data-req', 'live');
    // Every request in this scene is a POST, and a write is a square rather
    // than a dot, so the shape says what a repeat of it would cost.
    gsap.set(parts.dot, { opacity: 0 });
    const square = attachToRequest(parts, 'rect', {
      class: 'scene-req-square',
      x: '-12',
      y: '-12',
      width: '24',
      height: '24',
      rx: '5',
    });
    gsap.set(square, { opacity: 1 });
    showRequest(tl, parts, journey.start);

    for (const leg of journey.legs) {
      const to: Record<string, number> = {};
      if (leg.y !== undefined) to.y = leg.y;
      if (leg.x !== undefined) to.x = leg.x;
      tl.to(parts.group, { ...to, duration: leg.duration, ease: 'none' }, leg.at);
    }

    for (const [at, result] of journey.marks) {
      markRequest(tl, parts, result, at);
      tl.set(square, { opacity: 0, immediateRender: false }, at);
    }

    if (journey.key) {
      const label = attachToRequest(
        parts,
        'text',
        { class: 'scene-mono ik-carry', x: '0', y: String(LABEL_DY), 'text-anchor': 'middle' },
        journey.key,
      );
      tl.set(label, { opacity: 1, immediateRender: false }, journey.keyFrom);
      tl.set(
        label,
        { opacity: 0, immediateRender: false },
        Math.min(journey.keyTo, SCENE_DURATION),
      );
    }

    if (journey.code) {
      const label = attachToRequest(
        parts,
        'text',
        {
          class: 'scene-mono ik-carry ik-carry--code',
          x: '0',
          y: String(LABEL_DY),
          'text-anchor': 'middle',
        },
        journey.code,
      );
      tl.set(label, { opacity: 1, immediateRender: false }, journey.codeFrom);
    }

    if (journey.lost !== undefined) {
      // The answer is not refused, it simply never lands: it goes the colour of
      // something nobody is holding any more and disperses on the way up.
      attr(tl, parts.group, 'data-req', 'lost', journey.lost);
      tl.to(
        parts.ok,
        {
          scale: 1.6,
          transformOrigin: '50% 50%',
          duration: LOST_FADE,
          ease: 'power1.out',
          immediateRender: false,
        },
        journey.lost,
      );
      hideRequest(tl, parts, journey.lost, LOST_FADE);
      return;
    }

    hideRequest(tl, parts, journey.endAt, fadeAt(journey.endAt, SCENE_DURATION));
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // The stage is complete on the first frame: an empty store, a Payments box
  // that has charged nobody, and a client about to send its first POST without
  // a key on it, which is where the trouble in step 1 comes from.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
