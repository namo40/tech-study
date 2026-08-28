import {
  MAX_SEQ,
  SCENE_DURATION,
  X_A,
  X_B,
  X_C,
  X_PUBLISH,
  Y_PUBLISHER_BOTTOM,
  Y_SUB_C_TOP,
  Y_SUB_TOP,
  Y_TOPIC_BOTTOM,
  Y_TOPIC_TOP,
} from './stage';
import type { Badge, CellState, Choice, Mark, Mode, Sub } from './stage';
import { q } from '../shared/dom';
import { hideRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Publish-Subscribe scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told six things — when an
 * event leaves the Publisher, how often each subscription looks for the next
 * one, when B writes its position down and when it dies and comes back, when C
 * joins and where it chooses to start, and when the broker sweeps the retention
 * window. One pass over the whole 24 seconds turns that into everything else:
 * which copies travel and when, every `offset n`, every bookmark position, every
 * badge, `published n`, which cells are still readable, and when the picture
 * settles.
 *
 * Three derivations carry the argument. **One event becomes one copy per
 * subscription.** A copy is not a share of the event: it is dispatched by the
 * subscription that wants it, out of a log that never gives anything away, so
 * two subscriptions reading the same position both get it. That is the whole
 * difference from Competing Consumers, where one queue's work is split and a
 * message handed to one worker is gone from the others. **An offset is the only
 * thing a subscription owns.** Every delivery is chosen from the log by the
 * consumer's own cursor and its own pace, which is why B falling two events
 * behind changes nothing at all about A, and why the two never appear in each
 * other's derivation. **A checkpoint is where a restart lands.** B's position
 * after it comes back is read out of the checkpoint rather than carried through
 * the crash, and the events it missed are still in the log, so what a dead
 * subscriber loses is time.
 *
 * One thing is a picture rather than a measurement. The eight cells carry no
 * numbers, because what a cell says here is only that it was written and whether
 * it is still inside the window; which cell is which is its position, and the
 * count of written cells is `published n` by construction. The bookmarks under
 * them are bars for the same reason: each one stands on the number its own
 * subscription is already showing, so the two can never disagree.
 */

const ID = 'publish-subscribe';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** The publish lane: 200px from the Publisher down to the Topic. */
const LEG_PUBLISH = 0.26;
/** A copy lane: 230px from the Topic down into A or B. */
const LEG_COPY = 0.3;
/** The replay lane: 506px from the Topic down past A and B into C. */
const LEG_REPLAY = 0.62;

/** How long a traveller takes to fade once whatever it reached has absorbed it. */
const FADE = 0.1;

// --- what the scene is told ------------------------------------------------

/**
 * When an event leaves the Publisher. Three in the first step, three in the
 * second, and two in the third while B is dead — which is the only reason the
 * third step needs any at all, because the events B misses have to exist.
 */
const PUBLISHES = [1.8, 3.1, 4.4, 6.4, 8.2, 9.7, 13.6, 15.2];

/** The queue the topic is not: one event, one copy, one reader, and it is gone. */
const GHOST_AT = 0.5;
/** When the middle box stops behaving as a queue and starts behaving as a topic. */
const MODE_AT = 1.4;

/** Seconds between the start of one look for the next event and the next look. */
interface Pace {
  from: number;
  pace: number;
}

/** Everything the scene is told about one subscription. */
interface SubPlan {
  id: Sub;
  lane: Lane;
  /** When it first looks for something to read. */
  firstPoll: number;
  /** How often it looks, which is the only thing that makes it fast or slow. */
  paces: Pace[];
  /** When it exists at all. A is there from the first frame; C is not. */
  joinAt: number;
  /** When it writes its position down, and when it dies and comes back. */
  checkpointAt: number | null;
  downAt: number | null;
  upAt: number | null;
  /** How long after coming back it looks for the next event. */
  restartLead: number;
}

/**
 * The three subscriptions. A never changes pace and never fails, so it is the
 * control: everything B and C do has to leave it untouched. B is fast, then
 * slow, then dead, then draining. C is not there for three quarters of the
 * scene and then reads the whole log from the beginning.
 */
const SUBS: SubPlan[] = [
  {
    id: 'a',
    lane: 'copy-a',
    firstPoll: 0.3,
    paces: [{ from: 0, pace: 0.4 }],
    joinAt: 0,
    checkpointAt: null,
    downAt: null,
    upAt: null,
    restartLead: 0,
  },
  {
    id: 'b',
    lane: 'copy-b',
    firstPoll: 0.42,
    paces: [
      { from: 0, pace: 0.4 },
      { from: 6, pace: 2.4 },
      { from: 15.8, pace: 0.38 },
      { from: 17.4, pace: 0.4 },
    ],
    joinAt: 0,
    checkpointAt: 12.5,
    downAt: 13.2,
    upAt: 15.8,
    restartLead: 0.4,
  },
  {
    id: 'c',
    lane: 'replay',
    firstPoll: 19.24,
    paces: [{ from: 0, pace: 0.34 }],
    joinAt: 18.4,
    checkpointAt: null,
    downAt: null,
    upAt: null,
    restartLead: 0,
  },
];

/** When the two candidate starting points go up, and when C settles on one. */
const CHOICE_AT = 18.8;
const CHOSEN_AT = 19.24;
const CHOICE_OFF_AT = 19.9;

/** How long an event stays readable, and when the broker enforces it. */
const RETENTION = 18.2;
const RETENTION_SWEEPS = [20.8, 21.6];

/** How long the window stays held up once the second sweep has moved it. */
const LIMIT_FOR = 0.7;

/** When the difference between A's bookmark and B's is held up, and for how long. */
const GAP_AT = 10.2;
const GAP_FOR = 0.8;

/** How long after catching up a subscription stops calling itself `catching`. */
const LIVE_LAG = 0.24;

/** How close two samples of one repeating thing may sound, how close any cue
    may fall to another, and how close any of it may fall to a boundary. */
const SAMPLE_GAP = 0.9;
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- what one pass over the scene produces ---------------------------------

/** Which lane a traveller is on, which is also how it is drawn. */
type Lane = 'publish' | 'copy-a' | 'copy-b' | 'replay';

/** How long a traveller spends on each lane. */
const LEG: Record<Lane, number> = {
  publish: LEG_PUBLISH,
  'copy-a': LEG_COPY,
  'copy-b': LEG_COPY,
  replay: LEG_REPLAY,
};

interface Traveller {
  lane: Lane;
  start: number;
  land: number;
  /** A ghost is what a queue would have done, so it leaves nothing behind. */
  ghost: boolean;
}

interface Series {
  at: number;
  value: string;
}

/** One event, once the Topic has written it down. */
interface LoggedEvent {
  seq: number;
  at: number;
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
  cells: Series[][];
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the schedule fails loudly. */
  published: number;
  offsets: Record<Sub, number>;
  expired: number;
  settledAt: number | null;
}

// --- the simulation --------------------------------------------------------

/** What the simulation is holding about one subscription while it runs. */
interface SubState {
  plan: SubPlan;
  /** How far it has read, which is the number its bookmark stands on. */
  offset: number;
  /** How far it has asked for, which runs ahead of `offset` by whatever is in flight. */
  cursor: number;
  /** Whether it exists and is answering. */
  active: boolean;
  /** Whether it has joined at all, which is not the same as being up. */
  joined: boolean;
  /** Whether it is working through a backlog rather than keeping up. */
  resuming: boolean;
  /** The position it wrote down, which is the only thing a restart may read. */
  checkpoint: number | null;
}

/**
 * Walks the whole scene in time order.
 *
 * The publishes are booked first, because everything else is downstream of an
 * event existing: a copy can only be dispatched for something the log is holding,
 * a bookmark can only move when a copy lands, and the retention sweep can only
 * expire what was written. Booked events run earliest first and a running one may
 * book more, so a subscription that looks at 8.42 sees exactly the events
 * committed before it and nothing that comes later.
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

  /** Puts one traveller on a lane and answers when it gets to the far end. */
  const travel = (lane: Lane, start: number, ghost = false): number => {
    const land = round(start + LEG[lane]);
    travellers.push({ lane, start: round(start), land, ghost });
    return land;
  };

  // --- what the diagram is holding ----------------------------------------

  /** The log. Nothing is ever taken out of it except by the retention window. */
  const log: LoggedEvent[] = [];
  let published = 0;
  let expired = 0;
  let settledAt: number | null = null;

  const state: Record<Sub, SubState> = {} as Record<Sub, SubState>;
  for (const plan of SUBS) {
    state[plan.id] = {
      plan,
      offset: 0,
      cursor: 0,
      active: plan.joinAt === 0,
      joined: plan.joinAt === 0,
      resuming: false,
      checkpoint: null,
    };
  }

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  record('mode', 0, 'queue' satisfies Mode);
  record('published', 0, '0');
  record('expired', 0, '0');
  record('check', 0, 'off');
  record('choice', 0, 'none' satisfies Choice);
  record('mark', 0, 'none' satisfies Mark);
  record('settled', 0, 'off');
  for (const plan of SUBS) {
    record(`offset-${plan.id}`, 0, '0');
    record(`badge-${plan.id}`, 0, (plan.joinAt === 0 ? 'live' : 'off') satisfies Badge);
  }
  for (let n = 1; n <= MAX_SEQ; n += 1) record(`cell-${n}`, 0, 'none' satisfies CellState);

  // --- the queue the topic is not -----------------------------------------

  // One event, one copy, one reader. It is drawn hollow and counted nowhere,
  // because it is not something that happened: it is the shape being ruled out.
  schedule(GHOST_AT, () => {
    const arrive = travel('publish', GHOST_AT, true);
    schedule(arrive, () => {
      travel('copy-a', arrive, true);
    });
    fix(GHOST_AT, 'state');
  });

  schedule(MODE_AT, () => {
    record('mode', MODE_AT, 'topic' satisfies Mode);
    fix(MODE_AT, 'trip');
  });

  // --- the publishes, and the events they turn into ------------------------

  for (const at of PUBLISHES) {
    const arrive = travel('publish', at);
    schedule(arrive, () => {
      published += 1;
      const seq = published;
      log.push({ seq, at: arrive });
      // `published n` counts the cells the Topic wrote, never the sends the
      // Publisher made, so the readout and the log cannot drift apart.
      record('published', arrive, String(published));
      record(`cell-${seq}`, arrive, 'live' satisfies CellState);

      // An event published while somebody is down is the point of the log: it
      // waits in the Topic rather than in the subscriber that missed it.
      const waiting = SUBS.some((plan) => state[plan.id].joined && !state[plan.id].active);
      if (waiting) fix(arrive, 'state', 'wait');
      else sample(arrive, 'publish', 'state');
    });
  }

  // --- what each subscription reads, at its own pace -----------------------

  const paceAt = (plan: SubPlan, at: number): number => {
    let pace = plan.paces[0]?.pace ?? 1;
    for (const segment of plan.paces) if (at >= segment.from - EPS) pace = segment.pace;
    return pace;
  };

  /** Whether the window still covers an event, at the time somebody asks. */
  const readable = (event: LoggedEvent, at: number): boolean => {
    let swept = 0;
    for (const sweep of RETENTION_SWEEPS) if (at >= sweep - EPS) swept = sweep;
    if (swept === 0) return true;
    return round(event.at + RETENTION) > swept;
  };

  /**
   * The next event this subscription may read: the first one past its cursor
   * that the log is holding and the retention window still covers. Nothing here
   * consults any other subscription, which is the whole claim of the scene — and
   * an event the window has dropped is skipped rather than waited for, which is
   * the other one.
   */
  const nextFor = (sub: SubState, at: number): LoggedEvent | null => {
    for (const event of log) {
      if (event.seq <= sub.cursor) continue;
      if (!readable(event, at)) continue;
      return event;
    }
    return null;
  };

  const deliver = (sub: SubState, event: LoggedEvent, at: number): void => {
    sub.cursor = event.seq;
    const land = travel(sub.plan.lane, at);
    schedule(land, () => {
      if (event.seq !== sub.offset + 1) {
        problems.push(`${sub.plan.id} jumped from ${sub.offset} to ${event.seq} at ${land}`);
      }
      sub.offset = event.seq;
      record(`offset-${sub.plan.id}`, land, String(event.seq));

      const caughtUp = sub.offset === published;
      if (sub.resuming && caughtUp) {
        sub.resuming = false;
        const liveAt = round(land + LIVE_LAG);
        record(`badge-${sub.plan.id}`, liveAt, 'live' satisfies Badge);
        // Only a subscriber that was actually down announces that it is back.
        if (sub.plan.downAt !== null) fix(liveAt, 'state');
        fix(land, 'success', sub.plan.lane === 'replay' ? 'replay' : 'copy');
        schedule(liveAt, () => {
          const all = SUBS.every((plan) => {
            const other = state[plan.id];
            return other.joined && other.active && other.offset === published;
          });
          if (all && settledAt === null) {
            settledAt = liveAt;
            record('settled', liveAt, 'on');
          }
        });
      } else if (sub.plan.lane === 'replay') {
        sample(land, 'replay', 'success');
      } else {
        sample(land, 'copy', 'success');
      }
    });
  };

  const poll = (sub: SubState, at: number): void => {
    if (at > SCENE_DURATION) return;
    schedule(at, () => {
      if (!sub.active) return;
      const event = nextFor(sub, at);
      if (event) deliver(sub, event, at);
      poll(sub, round(at + paceAt(sub.plan, at)));
    });
  };

  for (const plan of SUBS) {
    const sub = state[plan.id];
    if (plan.joinAt > 0) {
      schedule(plan.joinAt, () => {
        sub.joined = true;
        sub.active = true;
        sub.resuming = true;
        record(`badge-${plan.id}`, plan.joinAt, 'catching' satisfies Badge);
        fix(plan.joinAt, 'trip');
      });
    }
    poll(sub, plan.firstPoll);

    if (plan.checkpointAt !== null) {
      const checkpointAt = plan.checkpointAt;
      schedule(checkpointAt, () => {
        sub.checkpoint = sub.offset;
        record('check', checkpointAt, String(sub.offset));
        fix(checkpointAt, 'state');
      });
    }

    if (plan.downAt !== null) {
      const downAt = plan.downAt;
      schedule(downAt, () => {
        sub.active = false;
        record(`badge-${plan.id}`, downAt, 'down' satisfies Badge);
        fix(downAt, 'failure');
      });
    }

    if (plan.upAt !== null) {
      const upAt = plan.upAt;
      schedule(upAt, () => {
        // The position a restart lands on is read out of the checkpoint, not
        // carried through the crash. There is no other source for it here.
        const from = sub.checkpoint;
        if (from === null) {
          problems.push(`${plan.id} came back at ${upAt} with no checkpoint to land on`);
          return;
        }
        sub.offset = from;
        sub.cursor = from;
        sub.active = true;
        sub.resuming = true;
        record(`offset-${plan.id}`, upAt, String(from));
        record(`badge-${plan.id}`, upAt, 'catching' satisfies Badge);
        fix(upAt, 'trip');
        poll(sub, round(upAt + plan.restartLead));
      });
    }
  }

  // --- the choice a new subscription gets ---------------------------------

  schedule(CHOICE_AT, () => {
    record('choice', CHOICE_AT, 'both' satisfies Choice);
    fix(CHOICE_AT, 'state');
  });
  schedule(CHOSEN_AT, () => record('choice', CHOSEN_AT, 'start' satisfies Choice));
  schedule(CHOICE_OFF_AT, () => record('choice', CHOICE_OFF_AT, 'none' satisfies Choice));

  // --- the window the log keeps -------------------------------------------

  for (const sweep of RETENTION_SWEEPS) {
    schedule(sweep, () => {
      let gone = 0;
      for (const event of log) {
        if (round(event.at + RETENTION) > sweep) continue;
        gone += 1;
        record(`cell-${event.seq}`, sweep, 'gone' satisfies CellState);
      }
      if (gone === expired) return;
      expired = gone;
      record('expired', sweep, String(gone));
      fix(sweep, 'state');
    });
  }

  // The second sweep is also where the scene says what a window costs, so the
  // expired end is held up rather than allowed to fade into the settled frame.
  const limitAt = RETENTION_SWEEPS[RETENTION_SWEEPS.length - 1] ?? 0;
  schedule(limitAt, () => record('mark', limitAt, 'limit' satisfies Mark));
  schedule(round(limitAt + LIMIT_FOR), () => record('mark', round(limitAt + LIMIT_FOR), 'none' satisfies Mark));

  // --- the one thing the second step is arguing ---------------------------

  schedule(GAP_AT, () => {
    record('mark', GAP_AT, 'gap' satisfies Mark);
    fix(GAP_AT, 'state');
  });
  schedule(round(GAP_AT + GAP_FOR), () => record('mark', round(GAP_AT + GAP_FOR), 'none' satisfies Mark));

  // --- run it --------------------------------------------------------------

  drain();

  if (published !== MAX_SEQ) {
    throw new Error(`${ID} scene: the log ended on ${published} events, and the stage draws ${MAX_SEQ}`);
  }
  for (const plan of SUBS) {
    const sub = state[plan.id];
    if (sub.offset !== published) {
      throw new Error(`${ID} scene: ${plan.id} ended on offset ${sub.offset}, not ${published}`);
    }
  }
  if (settledAt === null) throw new Error(`${ID} scene: the picture never settled`);
  if (problems.length > 0) throw new Error(`${ID} scene: ${problems.join('; ')}`);

  // --- the series, put in time order and collapsed -------------------------

  // Changes are recorded as they are worked out rather than as they happen — a
  // sweep lays down every cell it expires in one pass — so each key is sorted
  // once here. Two changes to one key at one instant would otherwise render in
  // insertion order forwards and in reverse backwards, so only the one that ends
  // up applying is kept.
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
  const keys = [
    'mode',
    'published',
    'expired',
    'check',
    'choice',
    'mark',
    'settled',
    ...SUBS.flatMap((plan) => [`offset-${plan.id}`, `badge-${plan.id}`]),
  ];
  for (const key of keys) flags[key] = seriesOf(key);
  const cells = Array.from({ length: MAX_SEQ }, (_value, index) => seriesOf(`cell-${index + 1}`));

  // --- the cues ------------------------------------------------------------

  // Same shape as the other scenes: everything the scene has to say is kept, and
  // the repeating families are thinned to samples so a copy landing is heard
  // often enough to read as a rhythm without becoming one.
  const accepted: Fixed[] = fixed
    .filter((entry) => !BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP - EPS))
    .sort((left, right) => left.at - right.at)
    .filter(
      (entry, index, list) =>
        index === 0 || entry.at - (list[index - 1]?.at ?? -99) >= MIN_CUE_GAP - EPS,
    );

  const lastOf: Record<string, number> = { publish: -99, copy: -99, replay: -99, wait: -99 };
  candidates.sort((left, right) => left.at - right.at);
  for (const candidate of candidates) {
    let previous = lastOf[candidate.family] ?? -99;
    for (const other of accepted) {
      if (other.family === candidate.family && other.at < candidate.at && other.at > previous) {
        previous = other.at;
      }
    }
    if (candidate.at - previous < SAMPLE_GAP - EPS) continue;
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
    published,
    offsets: {
      a: state.a.offset,
      b: state.b.offset,
      c: state.c.offset,
    },
    expired,
    settledAt,
  };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const cellElements = Array.from({ length: MAX_SEQ }, (_value, index) =>
    q<SVGRectElement>(stage, `.ps-cell--${index + 1}`, ID),
  );

  const sim = simulate();
  if (sim.published > MAX_SEQ) {
    throw new Error(`${ID} scene: the log outgrew the row the stage draws`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-ps-${name}`, entry.value, entry.at);
  }
  sim.cells.forEach((series, index) => {
    const element = cellElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-ps-cell', entry.value, entry.at);
  });

  // --- what travels --------------------------------------------------------

  /** Where a traveller starts, and the one coordinate its lane moves. */
  const LANES: Record<Lane, { x: number; y: number; to: number }> = {
    publish: { x: X_PUBLISH, y: Y_PUBLISHER_BOTTOM, to: Y_TOPIC_TOP },
    'copy-a': { x: X_A, y: Y_TOPIC_BOTTOM, to: Y_SUB_TOP },
    'copy-b': { x: X_B, y: Y_TOPIC_BOTTOM, to: Y_SUB_TOP },
    replay: { x: X_C, y: Y_TOPIC_BOTTOM, to: Y_SUB_C_TOP },
  };

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    // A ghost is drawn hollow rather than faded, so it is legible in both themes
    // and still obviously not something that happened.
    if (plan.ghost) request.group.classList.add('ps-ghost');

    parkRequest(request, lane.x, lane.y);
    showRequest(tl, request, plan.start);
    tl.to(
      request.group,
      { y: lane.to, duration: LEG[plan.lane], ease: 'none', immediateRender: false },
      plan.start,
    );
    // Every traveller here is absorbed by whatever it reached: an event by the
    // log, a copy by the subscription that asked for it. Nothing comes back, and
    // nothing carries a verdict, because a publisher is never told anything.
    hideRequest(tl, request, plan.land, FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: an empty log, two subscriptions
  // reading from position zero, no third subscription, no checkpoint, the middle
  // box still behaving as a queue, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
