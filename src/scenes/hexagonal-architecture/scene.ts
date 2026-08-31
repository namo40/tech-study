import gsap from 'gsap';
import {
  CARD_IDS,
  OK_MAX,
  SCENE_DURATION,
  STAGE_STATE,
  X_LANE,
  Y_CORE_BOTTOM,
  Y_CORE_TOP,
  Y_DETAILS_TOP,
  Y_OUTSIDE_BOTTOM,
} from './stage';
import type { Actor, CardId, CardState, Crack, Low, Mark } from './stage';
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
 * Hexagonal Architecture scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing here
 * is a continuous quantity — a socket is empty or filled, an adapter shows one
 * of two faces, the crack has run exactly as far as it has run, `ok n` is a
 * whole number — so every frame is a set of stacked variants and scrubbing
 * backwards lands on a value rather than on a blend of two.
 *
 * Nothing the reader reads is authored. The scene is told when the ghost wire
 * goes up, when the schema tick lands on `db`, when the crack reaches each of
 * the three things it reaches, when the wire is lifted, when the sockets appear,
 * when the adapters are plugged in, when the lower adapter is swapped, when the
 * family cards go up, what each detail costs to answer, how fast a traveller
 * moves, and when each request is made and by which actor.
 *
 * Everything else falls out of one pass over the current topology. A request
 * always enters through the in port, because after the wire is lifted there is
 * no other way in; the domain answers by itself when nothing is plugged into the
 * out socket, and drives whichever detail the lower adapter is showing when
 * something is. Which card answers is therefore never written down: it is read
 * off the adapter at the instant the domain needs it, which is why the swap is
 * the whole third step and why `db` goes quiet the moment it happens without
 * anything having to say so. `ok n` counts the answers that got back out.
 *
 * The scene draws no context borders and no aggregate door. Whose word means
 * what is the domain-driven design scene's subject; this one owns the direction
 * of the arrows — that a port is a contract the inside owns, that an adapter is
 * a translator at the edge, and that being swappable is what makes something a
 * detail. The persistence door in particular is the repository scene's, and this
 * scene's lower adapter is the general shape it is one case of.
 */

const ID = 'hexagonal-architecture';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 625;

/** The upper lane, ridden down by a request and back up by its answer. */
const LEG_IN = round((Y_CORE_TOP - Y_OUTSIDE_BOTTOM) / SPEED);
/** The lower lane, ridden down by a driven call and back up by its answer. */
const LEG_OUT = round((Y_DETAILS_TOP - Y_CORE_BOTTOM) / SPEED);

/** How long a traveller takes to go once it has nothing left to do. */
const MARK_FADE = 0.14;

/** The halo diameter two travellers on one column must always keep between them. */
const HALO = 52;

// --- what the scene is told ------------------------------------------------

/** When the world with no direction goes up, and when it is lifted. */
const GHOST_AT = 0.5;
const LIFT_AT = 3.0;

/** When somebody renames a column, and how far the crack that follows runs. */
const SCHEMA_AT = 1.4;
const CRACK_AT: [number, Crack][] = [
  [1.7, 'db'],
  [1.95, 'domain'],
  [2.2, 'web'],
];

/** When the two sockets appear, and when the two adapters are plugged in. */
const PORTS_AT = 6.5;
const ADAPTERS_AT = 12.5;

/** When the lower adapter is exchanged, and what it is exchanged for. */
const SWAP_AT = 14.9;
const SWAP_TO: Low = 'memory';

/** When the three drawings of the one rule go up together. */
const NAMES_AT = 18.5;

/** What each detail costs to answer, in seconds. `memory` is the cheap one. */
const DETAIL_COST: Record<CardId, number> = { db: 0.45, memory: 0.08, mail: 0.2 };

/** What the domain spends before it drives a detail, and after one answers. */
const DOMAIN_WORK = 0.1;
const DOMAIN_FINISH = 0.06;
/** What it spends when nothing is plugged into the out socket to drive. */
const DOMAIN_ALONE = 0.2;

/** How long a card holds the word that it just answered. */
const ANSWER_HOLD = 0.3;

/**
 * Every request: when it is made and who made it. Nothing here says where it
 * goes or what answers it — the topology at the instant the domain needs
 * something decides that, and after the swap the answer comes from somewhere
 * else without a single line of this table changing.
 */
interface RequestPlan {
  at: number;
  actor: Actor;
}

const REQUESTS: RequestPlan[] = [
  { at: 6.585, actor: 'web' },
  { at: 8.96, actor: 'web' },
  { at: 12.6, actor: 'web' },
  { at: 15.3, actor: 'test' },
  { at: 19.2, actor: 'web' },
  { at: 21.0, actor: 'test' },
];

/** The nine things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [3.9, 'inward', 0.6],
  [4.8, 'blind', 0.4],
  [8.6, 'out', 0.5],
  [10.6, 'contract', 0.35],
  [11.0, 'inside', 0.35],
  [17.2, 'swapped', 0.3],
  [17.55, 'detail', 0.3],
  [19.4, 'arrows', 0.35],
  [20.4, 'family', 0.35],
];

/** When the picture is called settled: every dependency pointing inward. */
const SETTLE_AT = 22.85;

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
type Kind = 'call' | 'drive';

/**
 * One traveller: down a lane, held at the far edge while whatever it asked for
 * happens, then back up the same lane. A request and the call the domain drives
 * are the same shape on two different lanes, which is the point of a port.
 */
interface Journey {
  lane: 'in' | 'out';
  home: number;
  far: number;
  kind: Kind;
  label: string;
  startAt: number;
  leg: number;
  dwell: number;
  /** When the result marker pops, or `null` for a traveller that just returns. */
  markAt: number | null;
  result: RequestResult;
  hideAt: number;
}

/** One request, once the scene has run it to the end. */
interface Answered {
  at: number;
  actor: Actor;
  /** The detail the domain drove, or `null` when it answered by itself. */
  detail: CardId | null;
  answeredAt: number;
  ok: number;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  answered: Answered[];
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fixed: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const answered: Answered[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, target: string, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fixed.push([round(at), name]);
  };
  const stage = (at: number, name: string, value: string): void => {
    setAttr(at, 'stage', `data-hex-${name}`, value);
  };

  let ghost = 'off';
  let schema = 'off';
  let crack = 'none';
  let inSocket = 'absent';
  let outSocket = 'absent';
  let top = 'absent';
  let low = 'absent';
  let domain = 'open';
  let actor = 'none';
  let okValue = 0;
  let names = 'off';
  let markValue = 'none';
  const cardState: Record<CardId, CardState> = { db: 'idle', memory: 'idle', mail: 'idle' };

  const { schedule, drain } = createScheduler();

  /** One setter per thing the stage says, each of which refuses a no-op. */
  const write = (
    at: number,
    name: string,
    want: string,
    read: () => string,
    keep: (value: string) => void,
  ): void => {
    if (read() === want) return;
    keep(want);
    stage(at, name, want);
  };
  const setGhost = (at: number, want: string): void =>
    write(at, 'ghost', want, () => ghost, (v) => { ghost = v; });
  const setSchema = (at: number, want: string): void =>
    write(at, 'schema', want, () => schema, (v) => { schema = v; });
  const setCrack = (at: number, want: string): void =>
    write(at, 'crack', want, () => crack, (v) => { crack = v; });
  const setIn = (at: number, want: string): void =>
    write(at, 'in', want, () => inSocket, (v) => { inSocket = v; });
  const setOut = (at: number, want: string): void =>
    write(at, 'out', want, () => outSocket, (v) => { outSocket = v; });
  const setTop = (at: number, want: string): void =>
    write(at, 'top', want, () => top, (v) => { top = v; });
  const setLow = (at: number, want: string): void =>
    write(at, 'low', want, () => low, (v) => { low = v; });
  const setDomain = (at: number, want: string): void =>
    write(at, 'domain', want, () => domain, (v) => { domain = v; });
  const setActor = (at: number, want: string): void =>
    write(at, 'actor', want, () => actor, (v) => { actor = v; });
  const setNames = (at: number, want: string): void =>
    write(at, 'names', want, () => names, (v) => { names = v; });
  const setMark = (at: number, want: string): void =>
    write(at, 'mark', want, () => markValue, (v) => { markValue = v; });

  /** The counter. It only ever counts an answer that got back out. */
  const setOk = (at: number, want: number): void => {
    if (want > OK_MAX) {
      problems.push(`${round(at)} the readout was asked for ok ${want}, which the stage never drew`);
      return;
    }
    if (okValue === want) return;
    okValue = want;
    stage(at, 'ok', String(want));
  };

  const setCard = (at: number, id: CardId, want: CardState): void => {
    if (cardState[id] === want) return;
    cardState[id] = want;
    setAttr(at, `card-${id}`, 'data-hex-card', want);
  };

  // --- the world with no direction -----------------------------------------

  schedule(GHOST_AT, () => {
    setGhost(GHOST_AT, 'on');
    cue(GHOST_AT, 'state');
  });

  schedule(SCHEMA_AT, () => {
    setSchema(SCHEMA_AT, 'on');
    cue(SCHEMA_AT, 'state');
  });

  // A crack only ever runs along a wire that is there to carry it, which is why
  // lifting the wire is the whole fix rather than a fix for this one column.
  for (const [at, extent] of CRACK_AT) {
    schedule(at, () => {
      if (ghost !== 'on') {
        problems.push(`${at} a crack ran with no wire to run along`);
        return;
      }
      setCrack(at, extent);
      if (extent === 'web') cue(at, 'failure');
    });
  }

  schedule(LIFT_AT, () => {
    setGhost(LIFT_AT, 'off');
    setCrack(LIFT_AT, 'none');
    setSchema(LIFT_AT, 'off');
    cue(LIFT_AT, 'trip');
  });

  // --- the doors, and what gets plugged into them ---------------------------

  schedule(PORTS_AT, () => {
    setIn(PORTS_AT, 'empty');
    setOut(PORTS_AT, 'empty');
    setDomain(PORTS_AT, 'ported');
    cue(PORTS_AT, 'state');
  });

  schedule(ADAPTERS_AT, () => {
    setIn(ADAPTERS_AT, 'socketed');
    setOut(ADAPTERS_AT, 'socketed');
    setTop(ADAPTERS_AT, 'web');
    setLow(ADAPTERS_AT, 'db');
    cue(ADAPTERS_AT, 'state');
  });

  schedule(SWAP_AT, () => {
    setLow(SWAP_AT, SWAP_TO);
    cue(SWAP_AT, 'state');
  });

  schedule(NAMES_AT, () => {
    setNames(NAMES_AT, 'on');
    cue(NAMES_AT, 'state');
  });

  // --- what a request does -------------------------------------------------

  /** The answer coming back out, and the traveller that carries it. */
  const close = (
    plan: RequestPlan,
    reaches: number,
    finish: number,
    detail: CardId | null,
  ): void => {
    const arrives = round(finish + LEG_IN);
    journeys.push({
      lane: 'in',
      home: Y_OUTSIDE_BOTTOM,
      far: Y_CORE_TOP,
      kind: 'call',
      label: '',
      startAt: round(plan.at),
      leg: LEG_IN,
      dwell: round(finish - reaches),
      markAt: arrives,
      result: 'ok',
      hideAt: arrives,
    });
    schedule(finish, () => setDomain(finish, 'ported'));
    schedule(arrives, () => {
      setOk(arrives, okValue + 1);
      setActor(arrives, 'none');
      cue(arrives, 'success');
      answered.push({
        at: round(plan.at),
        actor: plan.actor,
        detail,
        answeredAt: arrives,
        ok: okValue,
      });
    });
  };

  REQUESTS.forEach((plan) => {
    schedule(plan.at, () => {
      if (ghost === 'on') {
        problems.push(`${plan.at} a request was made into the world with no direction`);
        return;
      }
      if (inSocket === 'absent') {
        problems.push(`${plan.at} a request was made with no port to come in through`);
        return;
      }
      setActor(plan.at, plan.actor);
      const reaches = round(plan.at + LEG_IN);
      schedule(reaches, () => {
        // The one decision in the scene, and it is read rather than written: the
        // adapter at the edge turns whatever the actor speaks into a port call,
        // and the domain drives whichever detail the out socket is holding — or
        // answers by itself when the out socket is holding nothing.
        if (top !== 'absent') setTop(reaches, plan.actor);
        setDomain(reaches, 'work');
        const detail = outSocket === 'socketed' && low !== 'absent' ? (low as CardId) : null;
        if (detail === null) {
          close(plan, reaches, round(reaches + DOMAIN_ALONE), null);
          return;
        }
        const leaves = round(reaches + DOMAIN_WORK);
        const lands = round(leaves + LEG_OUT);
        const cost = DETAIL_COST[detail];
        const back = round(lands + cost);
        const home = round(back + LEG_OUT);
        journeys.push({
          lane: 'out',
          home: Y_CORE_BOTTOM,
          far: Y_DETAILS_TOP,
          kind: 'drive',
          label: detail,
          startAt: leaves,
          leg: LEG_OUT,
          dwell: cost,
          markAt: null,
          result: 'ok',
          hideAt: home,
        });
        schedule(lands, () => setCard(lands, detail, 'busy'));
        schedule(back, () => {
          setCard(back, detail, 'answer');
          const clear = round(back + ANSWER_HOLD);
          schedule(clear, () => setCard(clear, detail, 'idle'));
        });
        close(plan, reaches, round(home + DOMAIN_FINISH), detail);
      });
    });
  });

  // --- what the scene holds up, and where it stops --------------------------

  for (const [at, value, hold] of MARK_AT) {
    schedule(at, () => {
      setMark(at, value);
      cue(at, 'state');
    });
    schedule(round(at + hold), () => setMark(round(at + hold), 'none'));
  }

  schedule(SETTLE_AT, () => {
    stage(SETTLE_AT, 'settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  return finish({ raw, fixed, journeys, answered, problems });
}

// --- what has to be true for the picture to mean anything ------------------

interface RawSimulation {
  raw: AttrChange[];
  fixed: [number, SceneCue][];
  journeys: Journey[];
  answered: Answered[];
  problems: string[];
}

/** Where a traveller is at `t`: down the lane, held at the far edge, back up. */
const whereAt = (journey: Journey, t: number): number => {
  const span = journey.far - journey.home;
  const d = t - journey.startAt;
  if (d <= 0) return journey.home;
  if (d <= journey.leg) return journey.home + span * (d / journey.leg);
  if (d <= journey.leg + journey.dwell) return journey.far;
  const back = d - journey.leg - journey.dwell;
  if (back >= journey.leg) return journey.home;
  return journey.far - span * (back / journey.leg);
};

function finish(sim: RawSimulation): Simulation {
  const { raw, fixed, journeys, answered } = sim;
  const problems = [...sim.problems];

  // Every request answered once, and answered by whatever the topology was
  // holding at the instant the domain needed something.
  if (answered.length !== REQUESTS.length) {
    problems.push(`${answered.length} of ${REQUESTS.length} requests were answered`);
  }
  for (const plan of REQUESTS) {
    const answers = answered.filter((entry) => entry.at === round(plan.at));
    if (answers.length !== 1) {
      problems.push(`the request at ${plan.at} was answered ${answers.length} times`);
      continue;
    }
    const answer = answers[0];
    if (!answer) continue;
    if (answer.answeredAt <= plan.at) {
      problems.push(`the request at ${plan.at} was answered before it was made`);
    }
    if (plan.at < PORTS_AT) problems.push(`${plan.at} a request was made before the ports existed`);
    // Before the adapters exist there is nothing in the out socket to drive, so
    // the domain answers alone; afterwards it drives whatever is in that socket.
    const wantsDetail = plan.at + LEG_IN >= ADAPTERS_AT;
    if (wantsDetail && answer.detail === null) {
      problems.push(`${plan.at} the domain answered alone with an adapter in the out socket`);
    }
    if (!wantsDetail && answer.detail !== null) {
      problems.push(`${plan.at} the domain drove ${answer.detail} with nothing in the out socket`);
    }
    // The whole third step: after the swap the store is never asked again, and
    // the test's round trip runs on the in-memory detail and nothing else.
    if (answer.detail === 'db' && plan.at > SWAP_AT) {
      problems.push(`${plan.at} the store answered after it was swapped out`);
    }
    if (plan.actor === 'test' && answer.detail !== null && answer.detail !== SWAP_TO) {
      problems.push(`${plan.at} the test round trip touched ${answer.detail}`);
    }
    if (answer.detail === 'mail') {
      problems.push(`${plan.at} the scene drove mail, which no adapter is ever showing`);
    }
  }
  if (answered.some((entry) => entry.actor === 'test' && entry.detail === 'db')) {
    problems.push('a test round trip reached the store');
  }
  const drove = answered.filter((entry) => entry.detail !== null);
  if (!drove.some((entry) => entry.detail === 'db')) {
    problems.push('nothing was ever answered by the store, so the swap proves nothing');
  }
  if (!drove.some((entry) => entry.detail === SWAP_TO)) {
    problems.push(`nothing was ever answered by ${SWAP_TO}`);
  }
  if (answered.at(-1)?.ok !== REQUESTS.length) {
    problems.push(`the readout finished on ok ${answered.at(-1)?.ok}`);
  }

  // Every traveller rides one of the two declared lanes, end to end, and no
  // traveller exists at all while the wire that skips both of them is up.
  for (const journey of journeys) {
    const span = round(journey.startAt + 2 * journey.leg + journey.dwell);
    if (Math.abs(span - journey.hideAt) > 0.001) {
      problems.push(`a traveller from ${journey.startAt} is taken away at ${journey.hideAt}, not ${span}`);
    }
    if (journey.startAt < LIFT_AT) {
      problems.push(`a traveller set off at ${journey.startAt}, while the wire was still up`);
    }
    if (journey.lane === 'in' && journey.startAt < PORTS_AT) {
      problems.push(`${journey.startAt} something came in with no port to come in through`);
    }
    if (journey.lane === 'out' && journey.startAt < ADAPTERS_AT) {
      problems.push(`${journey.startAt} something went out with nothing in the out socket`);
    }
    if (journey.startAt < 0 || journey.hideAt + MARK_FADE > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${journey.startAt}`);
    }
  }

  // Two travellers on one column, measured rather than assumed, and measured
  // across directions because both columns carry traffic each way.
  for (const lane of ['in', 'out'] as const) {
    const onLane = journeys
      .filter((journey) => journey.lane === lane)
      .sort((l, r) => l.startAt - r.startAt);
    for (let a = 0; a < onLane.length; a += 1) {
      for (let b = a + 1; b < onLane.length; b += 1) {
        const left = onLane[a];
        const right = onLane[b];
        if (!left || !right) continue;
        const from = Math.max(left.startAt, right.startAt);
        const to = Math.min(left.hideAt + MARK_FADE, right.hideAt + MARK_FADE);
        if (to <= from) continue;
        for (let t = from; t <= to + EPS; t = round(t + 0.01)) {
          const apart = Math.abs(whereAt(left, t) - whereAt(right, t));
          if (apart < HALO - EPS) {
            problems.push(
              `travellers from ${left.startAt} and ${right.startAt} are ${apart.toFixed(0)}px apart at ${round(t)}`,
            );
            t = to;
          }
        }
      }
    }
  }

  // --- the discrete changes, in time order and collapsed -------------------

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

  // The readout counts answers and never counts anything else: it goes up by
  // one at a time and never comes down.
  let held = 0;
  for (const change of changes) {
    if (change.name !== 'data-hex-ok') continue;
    const value = Number(change.value);
    if (value !== held + 1) problems.push(`${change.at} the readout went from ok ${held} to ok ${value}`);
    held = value;
  }
  // The crack only ever runs while the wire is up, and it only ever runs outward.
  const order: Record<string, number> = { none: 0, db: 1, domain: 2, web: 3 };
  let wire = 'off';
  let extent = 0;
  for (const change of changes) {
    if (change.name === 'data-hex-ghost') wire = change.value;
    if (change.name !== 'data-hex-crack') continue;
    const want = order[change.value] ?? 0;
    if (want > extent && wire !== 'on') problems.push(`${change.at} a crack ran with the wire down`);
    if (want > 0 && want !== extent + 1) {
      problems.push(`${change.at} the crack jumped from ${extent} to ${want}`);
    }
    extent = want;
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

  journeys.sort((left, right) => left.startAt - right.startAt);

  return { changes, cues, journeys, answered };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  const alone = sim.answered.filter((entry) => entry.detail === null);
  if (alone.length !== 2) {
    throw new Error(`${ID} scene: the second step promises two answers with nothing in the out socket`);
  }
  const store = sim.answered.find((entry) => entry.detail === 'db');
  const fake = sim.answered.find((entry) => entry.actor === 'test' && entry.detail === SWAP_TO);
  if (!store || !fake) {
    throw new Error(`${ID} scene: the third step promises a store answer and then a test on the fake`);
  }
  if (fake.answeredAt - fake.at >= store.answeredAt - store.at) {
    throw new Error(`${ID} scene: the third step promises the test round trip is the quick one`);
  }
  const closing = sim.answered.filter((entry) => entry.at > 18);
  if (new Set(closing.map((entry) => entry.actor)).size !== 2) {
    throw new Error(`${ID} scene: the fourth step promises both actors driving the one domain`);
  }

  const targets: Record<string, Element> = { stage };
  for (const id of CARD_IDS) targets[`card-${id}`] = q(stage, `.hex-card--${id}`, ID);

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

    // A request coming in through the in port and a call the domain drives out
    // through the out port are two different things riding the same kind of
    // line, which is the shape a port makes them share.
    request.group.classList.add(`hex-req--${journey.kind}`);

    if (journey.label) {
      const label = attachToRequest(
        request,
        'text',
        { class: 'scene-req-label hex-tag', x: '-36', y: '9', 'text-anchor': 'end' },
        journey.label,
      );
      gsap.set(label, { opacity: 1 });
    }

    parkRequest(request, X_LANE, journey.home);
    showRequest(tl, request, journey.startAt);
    tl.to(
      request.group,
      { y: journey.far, duration: journey.leg, ease: 'none', immediateRender: false },
      journey.startAt,
    );
    tl.to(
      request.group,
      { y: journey.home, duration: journey.leg, ease: 'none', immediateRender: false },
      round(journey.startAt + journey.leg + journey.dwell),
    );

    if (journey.markAt !== null) markRequest(tl, request, journey.result, journey.markAt);
    hideRequest(tl, request, journey.hideAt, MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: an Outside holding both actors and
  // `ok 0`, a Core whose domain has no doors and nothing plugged into it, three
  // idle details, no family cards, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
