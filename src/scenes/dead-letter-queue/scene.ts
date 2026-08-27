import gsap from 'gsap';
import {
  DLQ_ROWS,
  MAX_DEPTH,
  MSG_BASE,
  SCENE_DURATION,
  SLOT_COUNT,
  STAGE_STATE,
  X_IN,
  X_SIDE,
  X_WORK,
  Y_BOTTOM,
  Y_PRODUCER,
  Y_QUEUE,
  Y_QUEUE_TOP,
} from './stage';
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
 * Dead Letter Queue scene: a 24 second, four step timeline.
 *
 * Same two rules as the other scenes: every tween sits at an absolute position,
 * and every discrete change is a zero-duration tween on a `data-*` attribute
 * that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told eight things: when
 * the producer sends each message and which of them cannot be handled, how long
 * a consumer spends on one before it answers, how many deliveries the broker
 * will try before it gives up, how long the one message with a time limit may
 * wait, how deep the shelf has to get and for how long before the alarm fires,
 * when the cause upstream is repaired, when the two repairable messages are
 * resubmitted, and when the one that is truly dead is discarded.
 *
 * Everything else falls out of one pass over the whole 24 seconds. The queue is
 * strictly first in, first out, so a message that fails and comes back goes to
 * the head and everything else waits behind it — which is why `depth` climbs
 * through the first step without anybody deciding that it should. A delivery
 * count belongs to the message rather than to the ring: the ring shows whatever
 * the queue is currently retrying, and it goes out when that message either
 * succeeds or is set aside. `dlq` counts rows the broker filled, `done` counts
 * acknowledgements, and the alarm is a threshold with a duration, so it fires
 * two seconds after the third message lands rather than the instant it does.
 *
 * Message ids start at `#4`: the producer's stream was already running when the
 * scene opened, so the fourth message the reader sees is the seventh sent, and
 * that is the `#7` the storyline follows.
 */

const ID = 'dead-letter-queue';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves ------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 1000;

/** The arrival lane: the bottom of the Producer to the top of the Queue. */
const TRIP_IN = round((Y_QUEUE_TOP - Y_PRODUCER) / SPEED);
/** Either bottom lane, which are the same length. */
const TRIP_OUT = round((Y_BOTTOM - Y_QUEUE) / SPEED);
/** How long a traveller takes to go once it has arrived. */
const FADE = 0.1;

// --- what the scene is told -----------------------------------------------

/**
 * What a message is. The two poison kinds differ only in how long the consumer
 * spends before it throws: `#7` fails on a downstream call it makes after it
 * starts, `#12` is rejected while it is still being deserialized.
 */
type Kind = 'normal' | 'poison-slow' | 'poison-fast' | 'expiring';

interface MessagePlan {
  /** When the producer sends it. */
  at: number;
  kind: Kind;
}

/**
 * The stream. Ids are not written here: message `k` is drawn `#(k + 3)`, so the
 * fourth entry below is the poison `#7`, the ninth is `#12`, and the twelfth is
 * the `#15` that runs out of time before anybody reaches it.
 */
const MESSAGES: MessagePlan[] = [
  { at: 0.15, kind: 'normal' },
  { at: 0.55, kind: 'normal' },
  { at: 0.95, kind: 'normal' },
  { at: 2.0, kind: 'poison-slow' },
  { at: 3.4, kind: 'normal' },
  { at: 4.6, kind: 'normal' },
  { at: 5.6, kind: 'normal' },
  { at: 9.6, kind: 'normal' },
  { at: 12.4, kind: 'poison-fast' },
  { at: 13.2, kind: 'normal' },
  { at: 14.2, kind: 'normal' },
  { at: 15.3, kind: 'expiring' },
  { at: 18.2, kind: 'normal' },
  { at: 21.0, kind: 'normal' },
  { at: 21.9, kind: 'normal' },
];

/** How long the consumer holds a message before it answers, per kind. */
const WORK: Record<Kind, number> = {
  normal: 0.3,
  'poison-slow': 0.32,
  'poison-fast': 0.1,
  expiring: 0.3,
};

/** Deliveries the broker will try before it sets a message aside. */
const MAX_DELIVERY = 3;
/** How long a message with a time limit may sit in the queue. */
const TTL = 0.5;
/** The broker's back-off between a failed delivery landing back and the next. */
const REDELIVER_AFTER = 0.5;
/** The beat between a redelivery landing and the consumer being free again. */
const CONSUMER_GAP = 0.12;
/** The beat between an acknowledgement and the consumer taking the next one. */
const HOLD = 0.16;
/** The beat between a message expiring and the broker moving it aside. */
const MOVE_AFTER = 0.18;
/** How long the tick in the Consumer holds one result. */
const TICK_HOLD = 0.28;

/** The alarm: how deep the shelf has to get, and for how long. */
const ALERT_AT = 3;
const ALERT_FOR = 2.0;

/** When the cause upstream is repaired, after which a resubmit can run. */
const FIX_AT = 19.2;
/** When each repairable message is put back, oldest row first. */
const RESUBMIT_AT = [19.8, 20.6];
/** When the message that can never run is discarded, and how long the stamp holds. */
const DISCARD_AT = 22.2;
const DISCARD_CLEAR = 0.35;
/** When the oldest row is opened up, and when it closes again. */
const DETAIL_FROM = 16.8;
const DETAIL_TO = 17.4;

/** The shortest gap between two sampled success cues. */
const SUCCESS_GAP = 0.3;

// --- what the simulation produces -----------------------------------------

interface AttrChange {
  at: number;
  target: string;
  name: string;
  value: string;
}

/** One leg of a journey: where it ends and how long it takes to get there. */
interface Leg {
  to: number;
  at: number;
  duration: number;
}

/** One traveller: a dot on one lane, carrying the id of the message it is. */
interface Journey {
  x: number;
  y0: number;
  id: number;
  showAt: number;
  legs: Leg[];
  mark: { result: RequestResult; at: number } | null;
  fadeAt: number;
}

interface Simulation {
  attrs: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
}

// --- the simulation -------------------------------------------------------

/** What the broker knows about one message, which is all it works from. */
interface Message {
  /** Drawn id, which is the position in the producer's stream. */
  id: number;
  kind: Kind;
  /** When it last entered the queue. */
  arrivedAt: number;
  /** The earliest the broker will hand it out again. */
  readyAt: number;
  /** Deliveries that came back with a failure. */
  failed: number;
}

/** Why a message is parked on the shelf. */
type Reason = 'none' | 'max' | 'expired' | 'resubmit' | 'discard';

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const cues: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  /** Successful acknowledgements, sampled once the pass is over. */
  const successAt: number[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    cues.push([round(at), name]);
  };

  const queue: Message[] = [];
  const shelf: (Message | null)[] = Array.from({ length: DLQ_ROWS }, () => null);
  const reasons: Reason[] = Array.from({ length: DLQ_ROWS }, () => 'none');

  let done = 0;
  let dlq = 0;
  let consumerBusy = false;
  let consumerFreeAt = 0;
  let armed = false;
  let alertOn = false;

  const { schedule, drain } = createScheduler();

  /**
   * The slot strip is written from the queue rather than from a plan: the row
   * of slots is what the queue holds, in order, so every state a slot can be in
   * falls out of the message standing in it.
   */
  const renderQueue = (at: number): void => {
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const held = queue[i];
      if (!held) {
        setAttr(at, `slot-${i}`, 'data-dq-slot', 'free');
        setAttr(at, `slot-${i}`, 'data-dq-msg', '0');
        continue;
      }
      const state = held.failed > 0 ? 'poison' : held.kind === 'expiring' ? 'expiring' : 'held';
      setAttr(at, `slot-${i}`, 'data-dq-slot', state);
      setAttr(at, `slot-${i}`, 'data-dq-msg', String(held.id));
    }
    setAttr(at, 'stage', 'data-dq-depth', String(Math.min(queue.length, MAX_DEPTH)));
  };

  const setTick = (at: number, value: 'ok' | 'fail'): void => {
    setAttr(at, 'stage', 'data-dq-tick', value);
    setAttr(round(at + TICK_HOLD), 'stage', 'data-dq-tick', 'off');
  };

  /** The alarm arms when the shelf is deep enough and fires if it stays there. */
  const armAlert = (at: number): void => {
    if (armed || dlq < ALERT_AT) return;
    armed = true;
    const fireAt = round(at + ALERT_FOR);
    schedule(fireAt, () => {
      if (dlq < ALERT_AT || alertOn) return;
      alertOn = true;
      setAttr(fireAt, 'stage', 'data-dq-alert', 'on');
      cue(fireAt, 'state');
    });
  };

  /** It clears only once the shelf is empty, which is what makes it an alarm. */
  const clearAlert = (at: number): void => {
    if (dlq < ALERT_AT) armed = false;
    if (!alertOn || dlq > 0) return;
    alertOn = false;
    setAttr(at, 'stage', 'data-dq-alert', 'off');
  };

  /** Books one pass of the broker at `at`, at most once per instant. */
  const booked = new Set<number>();
  const wake = (at: number): void => {
    const t = round(at);
    if (booked.has(t)) return;
    booked.add(t);
    schedule(t, () => pump(t));
  };

  /** Moves a message out of the queue and down the side lane onto the shelf. */
  const sideline = (at: number, message: Message, reason: 'max' | 'expired'): void => {
    const index = queue.indexOf(message);
    if (index < 0) return;
    queue.splice(index, 1);
    renderQueue(at);
    cue(at, 'trip');

    const landAt = round(at + TRIP_OUT);
    journeys.push({
      x: X_SIDE,
      y0: Y_QUEUE,
      id: message.id,
      showAt: at,
      legs: [{ to: Y_BOTTOM, at, duration: TRIP_OUT }],
      mark: null,
      fadeAt: landAt,
    });

    schedule(landAt, () => {
      const row = shelf.findIndex((held) => held === null);
      if (row < 0) return;
      shelf[row] = message;
      reasons[row] = reason;
      setAttr(landAt, `row-${row}`, 'data-dq-id', String(message.id));
      setAttr(landAt, `row-${row}`, 'data-dq-reason', reason);
      setAttr(landAt, `row-${row}`, 'data-dq-row', 'held');
      dlq += 1;
      setAttr(landAt, 'stage', 'data-dq-dlq', String(dlq));
      if (message.failed > 0) setAttr(landAt, 'stage', 'data-dq-delivery', 'off');
      armAlert(landAt);
    });
  };

  /** Hands the head of the queue to the consumer and books what comes back. */
  const dispatch = (at: number): void => {
    const message = queue.shift();
    if (!message) return;
    renderQueue(at);
    consumerBusy = true;

    const outAt = round(at + TRIP_OUT + WORK[message.kind]);
    const poisoned = message.kind === 'poison-slow' || message.kind === 'poison-fast';
    const ok = !poisoned || outAt >= FIX_AT;
    const backAt = round(outAt + TRIP_OUT);

    journeys.push({
      x: X_WORK,
      y0: Y_QUEUE,
      id: message.id,
      showAt: at,
      legs: ok
        ? [{ to: Y_BOTTOM, at, duration: TRIP_OUT }]
        : [
            { to: Y_BOTTOM, at, duration: TRIP_OUT },
            { to: Y_QUEUE, at: outAt, duration: TRIP_OUT },
          ],
      mark: { result: ok ? 'ok' : 'fail', at: outAt },
      fadeAt: ok ? outAt : backAt,
    });

    schedule(outAt, () => {
      if (ok) {
        done += 1;
        setAttr(outAt, 'stage', 'data-dq-done', String(done));
        setTick(outAt, 'ok');
        successAt.push(outAt);
        if (message.failed > 0) setAttr(outAt, 'stage', 'data-dq-delivery', 'off');
        consumerBusy = false;
        consumerFreeAt = round(outAt + HOLD);
        wake(consumerFreeAt);
        return;
      }

      message.failed += 1;
      setAttr(outAt, 'stage', 'data-dq-delivery', String(message.failed));
      setTick(outAt, 'fail');
      cue(outAt, 'failure');

      schedule(backAt, () => {
        message.readyAt = round(backAt + REDELIVER_AFTER);
        message.arrivedAt = backAt;
        queue.unshift(message);
        renderQueue(backAt);
        cue(backAt, 'state');
        consumerBusy = false;
        consumerFreeAt = round(backAt + CONSUMER_GAP);
        wake(Math.max(message.readyAt, consumerFreeAt));
      });
    });
  };

  /**
   * One pass of the broker: set aside whatever has run out of deliveries, then
   * hand the head to the consumer if both are ready. Anything it cannot do yet
   * books the instant it could.
   */
  function pump(now: number): void {
    for (;;) {
      const head = queue[0];
      if (!head) return;
      if (head.failed >= MAX_DELIVERY) {
        if (head.readyAt > now) {
          wake(head.readyAt);
          return;
        }
        sideline(now, head, 'max');
        continue;
      }
      if (consumerBusy) return;
      const ready = Math.max(head.readyAt, consumerFreeAt);
      if (ready > now) {
        wake(ready);
        return;
      }
      dispatch(now);
      return;
    }
  }

  // --- the producer -------------------------------------------------------

  MESSAGES.forEach((plan, index) => {
    const message: Message = {
      id: index + 1 + MSG_BASE,
      kind: plan.kind,
      arrivedAt: 0,
      readyAt: 0,
      failed: 0,
    };
    const landAt = round(plan.at + TRIP_IN);

    journeys.push({
      x: X_IN,
      y0: Y_PRODUCER,
      id: message.id,
      showAt: plan.at,
      legs: [{ to: Y_QUEUE_TOP, at: plan.at, duration: TRIP_IN }],
      mark: null,
      fadeAt: landAt,
    });

    schedule(landAt, () => {
      message.arrivedAt = landAt;
      message.readyAt = landAt;
      queue.push(message);
      renderQueue(landAt);

      if (plan.kind === 'expiring') {
        const expiresAt = round(landAt + TTL);
        schedule(expiresAt, () => {
          if (!queue.includes(message)) return;
          cue(expiresAt, 'state');
          const moveAt = round(expiresAt + MOVE_AFTER);
          schedule(moveAt, () => {
            sideline(moveAt, message, 'expired');
            pump(moveAt);
          });
        });
      }

      pump(landAt);
    });
  });

  // --- the repair, and what it lets happen --------------------------------

  setAttr(FIX_AT, 'stage', 'data-dq-fix', 'on');
  cue(FIX_AT, 'trip');

  RESUBMIT_AT.forEach((at) => {
    schedule(at, () => {
      const row = shelf.findIndex((held, index) => held !== null && reasons[index] === 'max');
      const message = row < 0 ? null : shelf[row];
      if (row < 0 || !message) return;

      reasons[row] = 'resubmit';
      setAttr(at, `row-${row}`, 'data-dq-reason', 'resubmit');
      cue(at, 'trip');

      const landAt = round(at + TRIP_OUT);
      journeys.push({
        x: X_SIDE,
        y0: Y_BOTTOM,
        id: message.id,
        showAt: at,
        legs: [{ to: Y_QUEUE, at, duration: TRIP_OUT }],
        mark: null,
        fadeAt: landAt,
      });

      schedule(landAt, () => {
        shelf[row] = null;
        reasons[row] = 'none';
        setAttr(landAt, `row-${row}`, 'data-dq-row', 'none');
        setAttr(landAt, `row-${row}`, 'data-dq-reason', 'none');
        setAttr(landAt, `row-${row}`, 'data-dq-id', '0');
        dlq -= 1;
        setAttr(landAt, 'stage', 'data-dq-dlq', String(dlq));
        clearAlert(landAt);

        message.failed = 0;
        message.arrivedAt = landAt;
        message.readyAt = landAt;
        queue.push(message);
        renderQueue(landAt);
        pump(landAt);
      });
    });
  });

  schedule(DISCARD_AT, () => {
    const row = shelf.findIndex((held, index) => held !== null && reasons[index] === 'expired');
    if (row < 0) return;
    reasons[row] = 'discard';
    setAttr(DISCARD_AT, `row-${row}`, 'data-dq-reason', 'discard');
    cue(DISCARD_AT, 'state');

    const clearAt = round(DISCARD_AT + DISCARD_CLEAR);
    schedule(clearAt, () => {
      shelf[row] = null;
      reasons[row] = 'none';
      setAttr(clearAt, `row-${row}`, 'data-dq-row', 'none');
      setAttr(clearAt, `row-${row}`, 'data-dq-reason', 'none');
      setAttr(clearAt, `row-${row}`, 'data-dq-id', '0');
      dlq -= 1;
      setAttr(clearAt, 'stage', 'data-dq-dlq', String(dlq));
      clearAlert(clearAt);
    });
  });

  /** The oldest row, opened up for as long as the reader is asked to read it. */
  schedule(DETAIL_FROM, () => {
    const row = shelf.findIndex((held) => held !== null);
    if (row < 0) return;
    setAttr(DETAIL_FROM, `row-${row}`, 'data-dq-row', 'detail');
    schedule(DETAIL_TO, () => {
      if (shelf[row] === null) return;
      setAttr(DETAIL_TO, `row-${row}`, 'data-dq-row', 'held');
    });
  });

  drain();

  // --- the success cues, sampled rather than counted ----------------------

  successAt.sort((left, right) => left - right);
  let lastSample = -Infinity;
  for (const at of successAt) {
    if (at - lastSample < SUCCESS_GAP) continue;
    lastSample = at;
    cue(at, 'success');
  }

  // --- put the discrete changes in time order -----------------------------

  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}@${change.name}`);
  }

  const seen = new Map<string, string>();
  for (const [key, value] of Object.entries(STAGE_STATE)) seen.set(key, value);
  for (let n = 0; n < SLOT_COUNT; n += 1) {
    seen.set(`slot-${n}@data-dq-slot`, 'free');
    seen.set(`slot-${n}@data-dq-msg`, '0');
  }
  for (let n = 0; n < DLQ_ROWS; n += 1) {
    seen.set(`row-${n}@data-dq-row`, 'none');
    seen.set(`row-${n}@data-dq-id`, '0');
    seen.set(`row-${n}@data-dq-reason`, 'none');
  }

  const attrs: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}@${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    attrs.push(change);
  }

  cues.sort((left, right) => left[0] - right[0]);
  journeys.sort((left, right) => left.showAt - right.showAt);

  return { attrs, cues, journeys };
}

// --- the timeline ---------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const targets: Record<string, Element> = { stage };
  for (let n = 0; n < SLOT_COUNT; n += 1) {
    targets[`slot-${n}`] = q<SVGGElement>(stage, `.dq-slot--${n}`, ID);
  }
  for (let n = 0; n < DLQ_ROWS; n += 1) {
    targets[`row-${n}`] = q<SVGGElement>(stage, `.dq-row--${n}`, ID);
  }

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();
  const parts = mountRequests(layer, sim.journeys.length, ID);

  const tl = createSceneTimeline();

  // --- discrete state -----------------------------------------------------

  for (const change of sim.attrs) {
    const target = targets[change.target];
    if (target) attr(tl, target, change.name, change.value, change.at);
  }

  // --- what travels -------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;

    const label = attachToRequest(
      request,
      'text',
      { class: 'scene-req-label dq-tag', x: '36', y: '9' },
      `#${journey.id}`,
    );
    gsap.set(label, { opacity: 1 });

    parkRequest(request, journey.x, journey.y0);
    showRequest(tl, request, journey.showAt);
    for (const leg of journey.legs) {
      tl.to(
        request.group,
        { y: leg.to, duration: leg.duration, ease: 'none', immediateRender: false },
        leg.at,
      );
    }
    if (journey.mark) markRequest(tl, request, journey.mark.result, journey.mark.at);
    hideRequest(tl, request, journey.fadeAt, FADE);
  });

  // --- sound --------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels --------------------------------------------------------

  // The stage is complete on the first frame: an empty slot strip at depth
  // zero, no delivery count, an empty shelf, the alarm out and every readout at
  // zero.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
