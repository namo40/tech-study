import {
  MS_VALUES,
  OK_MAX,
  SCENE_DURATION,
  STAGE_STATE,
  VALUE_MAX,
  VALUE_MIN,
  X_R1,
  X_R2,
  X_VERDICT,
  Y_CHOICE_TOP,
  Y_CLIENTS_BOTTOM,
  Y_REPLICAS_BOTTOM,
  Y_REPLICAS_TOP,
} from './stage';
import type { Answer, CardState, LampState, LinkState, Mark, ReplicaId } from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * CAP Theorem scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing
 * here is a continuous quantity — a link is whole or it is not, a card is lit
 * or it is not, a replica holds one value, `ok n` and `ms n` are whole numbers
 * — so every frame is a set of stacked variants and scrubbing backwards lands
 * on a value rather than on a blend of two.
 *
 * Nothing the reader reads is authored. The scene is told when each write is
 * made, when each read is made and which replica it goes to, which reads are
 * measured and which of them have to be strongly consistent, when the network
 * is partitioned and when it heals, when the choice is made and which way, and
 * when the picture is called settled.
 *
 * Everything else falls out of one pass over that. A write lands on `R1`; the
 * `link` carries it to `R2` unless the `link` is cut, in which case `R2` simply
 * stops receiving and falls behind. A read's verdict is read off the card that
 * is lit and the state of the wire at the instant the read arrives: with no
 * card, both sides answer and the two answers may differ, which is the whole of
 * the first step; under `C`, the side that cannot reach agreement refuses and
 * the reader sees `wait` rather than a number; under `A`, both sides answer and
 * an answer that is not the latest is marked `stale`. What each read costs is
 * the sum of the legs it actually travelled, which is why a strongly consistent
 * read reads higher on the meter than a relaxed one without anybody writing the
 * two numbers down.
 *
 * The scene does not own the lag between a primary and a replica, which is the
 * replication lag scene's subject: there the delay is the phenomenon, and the
 * question is which reads can live with it. Here the wire is either carrying
 * agreement or it has been cut, and the subject is the choice the cut forces —
 * and the fourth step's half of it, which is the one you pay for on an ordinary
 * day with no partition anywhere.
 */

const ID = 'cap-theorem';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 500;

/** The two client lanes, which are the same length as each other. */
const LEG_UP = round((Y_REPLICAS_TOP - Y_CLIENTS_BOTTOM) / SPEED);
/** The verdict lane, from the Replicas band down to the Choice band. */
const LEG_LOW = round((Y_CHOICE_TOP - Y_REPLICAS_BOTTOM) / SPEED);

/** What a replica spends answering from the copy it is holding. */
const SERVE = 0.1;
/** What agreement costs: the round trip a strongly consistent read must pay. */
const CONSULT = 0.6;
/** How long the wiring takes to carry one change from `R1` to `R2`. */
const SYNC = 0.22;

/** How long a traveller takes to go once it has nothing left to do. */
const MARK_FADE = 0.14;

/** The halo diameter two travellers on one column must always keep between them. */
const HALO = 52;

/** The meter's scale: one second of round trip reads as this many milliseconds. */
const MS_PER_SECOND = 100;

// --- what the scene is told ------------------------------------------------

/** When each write is made. Every write lands on `R1` and moves it on by one. */
const WRITE_AT = [0.5, 1.6, 7.5, 13.5];

/**
 * The one write whose trip across the wiring the scene sounds: the first step's
 * single healthy cut, where the reader is shown what the `link` is for before
 * anything cuts it.
 */
const NORMAL_CUT_AT = 0.5;

/**
 * One read: when it leaves the Clients band, which replica it goes to, whether
 * it must reach agreement before it answers, and whether the meter is measuring
 * it. Reads that share a `question` are one question asked of both replicas.
 */
interface ReadPlan {
  at: number;
  target: ReplicaId;
  strong?: boolean;
  metered?: boolean;
  question: number;
}

const READS: ReadPlan[] = [
  { at: 1.9, target: 'r1', question: 1 },
  { at: 1.9, target: 'r2', question: 1 },
  { at: 7.8, target: 'r1', question: 2 },
  { at: 8.6, target: 'r2', question: 3 },
  { at: 10.4, target: 'r2', question: 4 },
  { at: 13.8, target: 'r1', question: 5 },
  { at: 14.6, target: 'r2', question: 6 },
  { at: 16.4, target: 'r2', question: 7 },
  { at: 18.8, target: 'r1', strong: true, metered: true, question: 8 },
  { at: 20.0, target: 'r2', metered: true, question: 9 },
  { at: 21.5, target: 'r2', metered: true, question: 10 },
];

/**
 * When the network is partitioned and when it heals. The first window is the
 * first step's ghost: a world in which nobody has chosen, which is taken away
 * again rather than healed, so its replicas simply agree once it is gone.
 */
interface Partition {
  from: number;
  to: number;
  ghost?: boolean;
}

const PARTITIONS: Partition[] = [
  { from: 1.4, to: 3.0, ghost: true },
  { from: 7.4, to: 10.0 },
  { from: 13.4, to: 16.0 },
];

/** When each card is lit, in the order the scene lights them. */
const CARD_AT: [number, CardState][] = [
  [6.5, 'c'],
  [12.5, 'a'],
];

/** The four things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark, number][] = [
  [3.9, 'p', 0.6],
  [4.8, 'ca', 0.5],
  [18.5, 'plain', 0.5],
  [21.2, 'else', 0.5],
];

/** When the picture is called settled: the trade made, and still being made. */
const SETTLE_AT = 22.65;

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

/** Which lane a traveller rides, which is also what kind of thing it is. */
type Lane = 'r1' | 'r2' | 'verdict';

/** What a traveller is: a change being made, a question being asked, a verdict. */
type Kind = 'write' | 'read' | 'strong' | 'verdict';

/**
 * One traveller: down a lane, held at the far edge while whatever it asked for
 * happens, and — for a question — back up the same lane with the answer. A
 * write and a verdict are the same shape with the return leg left off, because
 * neither of them is a question the reader is waiting on.
 */
interface Journey {
  kind: Kind;
  lane: Lane;
  x: number;
  home: number;
  far: number;
  startAt: number;
  leg: number;
  dwell: number;
  returns: boolean;
  markAt: number | null;
  result: RequestResult;
  answer: Answer;
  hideAt: number;
}

/** One read, once the scene has run it to the end. */
interface Answered {
  at: number;
  target: ReplicaId;
  question: number;
  strong: boolean;
  metered: boolean;
  card: CardState;
  cut: boolean;
  ghost: boolean;
  value: number;
  latest: number;
  answer: Answer;
  homeAt: number;
  ms: number;
  ok: number | null;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  answered: Answered[];
  splits: [number, number][];
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
    setAttr(at, 'stage', `data-cap-${name}`, value);
  };

  let link: LinkState = 'ok';
  let card: CardState = 'none';
  let lamp: LampState = 'none';
  let ghost = false;
  let split = false;
  let markValue: Mark = 'none';
  let okValue = 0;
  let msValue = 'off';
  let latest = VALUE_MIN;
  const held: Record<ReplicaId, number> = { r1: VALUE_MIN, r2: VALUE_MIN };
  const flying: Record<'write' | 'read', number> = { write: 0, read: 0 };
  const chip: Record<'write' | 'read', string> = { write: 'off', read: 'off' };
  /** The answers a question has collected, so a split is read off the answers. */
  const asked = new Map<number, number[]>();

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
  const setLink = (at: number, want: LinkState): void =>
    write(at, 'link', want, () => link, (v) => { link = v as LinkState; });
  const setCard = (at: number, want: CardState): void =>
    write(at, 'card', want, () => card, (v) => { card = v as CardState; });
  const setLamp = (at: number, want: LampState): void =>
    write(at, 'lamp', want, () => lamp, (v) => { lamp = v as LampState; });
  const setGhost = (at: number, want: boolean): void =>
    write(at, 'ghost', want ? 'on' : 'off', () => (ghost ? 'on' : 'off'), (v) => { ghost = v === 'on'; });
  const setSplit = (at: number, want: boolean): void =>
    write(at, 'split', want ? 'on' : 'off', () => (split ? 'on' : 'off'), (v) => { split = v === 'on'; });
  const setMark = (at: number, want: Mark): void =>
    write(at, 'mark', want, () => markValue, (v) => { markValue = v as Mark; });
  const setMs = (at: number, want: string): void =>
    write(at, 'ms', want, () => msValue, (v) => { msValue = v; });
  const setChip = (at: number, kind: 'write' | 'read', want: string): void =>
    write(at, kind, want, () => chip[kind], (v) => { chip[kind] = v; });

  /** What a replica holds. It only ever moves forward, one write at a time. */
  const setValue = (at: number, id: ReplicaId, want: number): void => {
    if (want < VALUE_MIN || want > VALUE_MAX) {
      problems.push(`${round(at)} ${id} was asked to hold ${want}, which the stage never drew`);
      return;
    }
    if (held[id] === want) return;
    if (want < held[id]) problems.push(`${round(at)} ${id} went backwards from ${held[id]} to ${want}`);
    held[id] = want;
    stage(at, id, String(want));
  };

  /** The readout. It only ever counts a read that came back with an answer. */
  const setOk = (at: number, want: number): void => {
    if (want > OK_MAX) {
      problems.push(`${round(at)} the readout was asked for ok ${want}, which the stage never drew`);
      return;
    }
    if (okValue === want) return;
    okValue = want;
    stage(at, 'ok', String(want));
  };

  /** Whichever chip names the kind of request that is outstanding. */
  const enters = (at: number, kind: 'write' | 'read'): void => {
    flying[kind] += 1;
    if (flying[kind] === 1) setChip(at, kind, 'on');
  };
  const leaves = (at: number, kind: 'write' | 'read'): void => {
    flying[kind] -= 1;
    if (flying[kind] === 0) setChip(at, kind, 'off');
  };

  // --- the network ----------------------------------------------------------

  for (const window of PARTITIONS) {
    schedule(window.from, () => {
      setLink(window.from, 'cut');
      if (window.ghost) setGhost(window.from, true);
      cue(window.from, 'state');
    });

    schedule(window.to, () => {
      if (window.ghost) {
        // A world nobody chose in is taken away rather than healed: the picture
        // it was drawn over comes back, and the two answers go with it.
        setSplit(window.to, false);
        setGhost(window.to, false);
        setLink(window.to, 'ok');
        setValue(window.to, 'r2', latest);
        cue(window.to, 'trip');
        return;
      }
      setLamp(window.to, 'none');
      setLink(window.to, 'sync');
      cue(window.to, 'state');
      const caught = round(window.to + SYNC);
      schedule(caught, () => {
        setValue(caught, 'r2', latest);
        setLink(caught, 'ok');
      });
    });
  }

  // --- what a write does ----------------------------------------------------

  for (const at of WRITE_AT) {
    schedule(at, () => {
      const lands = round(at + LEG_UP);
      const next = latest + 1;
      enters(at, 'write');
      journeys.push({
        kind: 'write',
        lane: 'r1',
        x: X_R1,
        home: Y_CLIENTS_BOTTOM,
        far: Y_REPLICAS_TOP,
        startAt: round(at),
        leg: LEG_UP,
        dwell: 0,
        returns: false,
        markAt: lands,
        result: 'ok',
        answer: 'none',
        hideAt: lands,
      });
      schedule(lands, () => {
        latest = next;
        setValue(lands, 'r1', next);
        leaves(lands, 'write');
        if (link === 'cut') return;
        // The wiring carries the change across, and `R2` is level again. This
        // is the only place `R2` is ever given a value it did not have.
        setLink(lands, 'sync');
        if (at === NORMAL_CUT_AT) cue(lands, 'state');
        const carried = round(lands + SYNC);
        schedule(carried, () => {
          setValue(carried, 'r2', next);
          setLink(carried, 'ok');
        });
      });
    });
  }

  // --- what a read does -----------------------------------------------------

  for (const plan of READS) {
    schedule(plan.at, () => {
      const lands = round(plan.at + LEG_UP);
      const dwell = round((plan.strong ? CONSULT : 0) + SERVE);
      const marks = round(lands + dwell);
      const home = round(marks + LEG_UP);
      enters(plan.at, 'read');

      schedule(lands, () => {
        // Everything the verdict is read off, taken at the instant the read
        // arrives, so the record cannot drift with the rest of the scene.
        const cut = link === 'cut';
        const cardNow = card;
        const latestNow = latest;
        const value = held[plan.target];
        const fresh = value === latestNow;
        const counted = !ghost;

        // The verdict, read off the card that is lit and the state of the wire.
        // With no card there is no rule under which an answer could be called
        // old, so both sides answer and neither answer is marked.
        let answer: Answer;
        if (ghost || cardNow === 'none') answer = 'unmarked';
        else if (cardNow === 'c') answer = cut && plan.target === 'r2' ? 'refused' : 'fresh';
        else answer = fresh ? 'fresh' : 'stale';

        if (cardNow === 'c' && !ghost && answer !== 'refused' && !fresh) {
          problems.push(`${lands} a read under C was answered with ${value} while ${latestNow} was the latest`);
        }
        if (cardNow === 'a' && !ghost && answer === 'refused') {
          problems.push(`${lands} a read under A was refused`);
        }

        if (plan.strong) {
          // Agreement before it speaks: the wire carries a round trip, and the
          // meter charges for it.
          if (cut) problems.push(`${lands} a strongly consistent read consulted across a cut link`);
          setLink(lands, 'consult');
          cue(lands, 'state');
          const agreed = round(lands + CONSULT);
          schedule(agreed, () => setLink(agreed, 'ok'));
        }

        journeys.push({
          kind: plan.strong ? 'strong' : 'read',
          lane: plan.target,
          x: plan.target === 'r1' ? X_R1 : X_R2,
          home: Y_CLIENTS_BOTTOM,
          far: Y_REPLICAS_TOP,
          startAt: round(plan.at),
          leg: LEG_UP,
          dwell,
          returns: true,
          markAt: marks,
          result: answer === 'refused' ? 'fail' : 'ok',
          answer,
          hideAt: home,
        });

        schedule(marks, () => {
          if (answer === 'refused') {
            setLamp(marks, 'wait');
            cue(marks, 'state');
          } else if (answer === 'stale' && !ghost) {
            setLamp(marks, 'stale');
            cue(marks, 'state');
          } else if (!ghost) {
            cue(marks, 'success');
          }

          // A verdict with a name on a card rides down to the card that names it.
          if (!ghost && (answer === 'refused' || answer === 'stale')) {
            const reaches = round(marks + LEG_LOW);
            journeys.push({
              kind: 'verdict',
              lane: 'verdict',
              x: X_VERDICT,
              home: Y_REPLICAS_BOTTOM,
              far: Y_CHOICE_TOP,
              startAt: marks,
              leg: LEG_LOW,
              dwell: 0,
              returns: false,
              markAt: null,
              result: 'ok',
              answer: 'none',
              hideAt: reaches,
            });
          }

          // One question asked of both replicas comes back with two answers,
          // and if they are not the same answer the ghost says so.
          const seen = asked.get(plan.question) ?? [];
          seen.push(value);
          asked.set(plan.question, seen);
          const siblings = READS.filter((entry) => entry.question === plan.question).length;
          if (siblings > 1 && seen.length === siblings && new Set(seen).size > 1) {
            if (!ghost) problems.push(`${marks} two answers to one question outside the ghost`);
            setSplit(marks, true);
            cue(marks, 'failure');
          }
        });

        schedule(home, () => {
          leaves(home, 'read');
          const cost = round(home - plan.at);
          const ms = Math.round(cost * MS_PER_SECOND);
          if (answer !== 'refused' && counted) setOk(home, okValue + 1);
          if (plan.metered) {
            if (!MS_VALUES.includes(ms)) {
              problems.push(`${home} a read measured ${ms} ms, which the meter never drew`);
            } else {
              setMs(home, String(ms));
            }
          }
          answered.push({
            at: round(plan.at),
            target: plan.target,
            question: plan.question,
            strong: plan.strong === true,
            metered: plan.metered === true,
            card: cardNow,
            cut,
            ghost: !counted,
            value,
            latest: latestNow,
            answer,
            homeAt: home,
            ms,
            ok: answer !== 'refused' && counted ? okValue : null,
          });
        });
      });
    });
  }

  // --- the choice, what it is held up against, and where it stops -----------

  for (const [at, want] of CARD_AT) {
    schedule(at, () => {
      setCard(at, want);
      cue(at, 'state');
    });
  }

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
  if (!journey.returns) return journey.far;
  if (d <= journey.leg + journey.dwell) return journey.far;
  const back = d - journey.leg - journey.dwell;
  if (back >= journey.leg) return journey.home;
  return journey.far - span * (back / journey.leg);
};

/** Turns a series of changes into the windows in which one value is held. */
const windowsOf = (
  changes: AttrChange[],
  name: string,
  initial: string,
  wanted: (value: string) => boolean,
): [number, number][] => {
  const points: [number, string][] = [[0, initial]];
  for (const change of changes) {
    if (change.name === name) points.push([change.at, change.value]);
  }
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i += 1) {
    const entry = points[i];
    if (!entry || !wanted(entry[1])) continue;
    out.push([entry[0], points[i + 1]?.[0] ?? SCENE_DURATION]);
  }
  return out;
};

function finish(sim: RawSimulation): Simulation {
  const { raw, fixed, journeys, answered } = sim;
  const problems = [...sim.problems];

  // Every read answered once, and answered after it was made.
  if (answered.length !== READS.length) {
    problems.push(`${answered.length} of ${READS.length} reads came back`);
  }
  for (const plan of READS) {
    const entries = answered.filter(
      (entry) => entry.at === round(plan.at) && entry.target === plan.target,
    );
    if (entries.length !== 1) {
      problems.push(`the read at ${plan.at} to ${plan.target} came back ${entries.length} times`);
      continue;
    }
    const entry = entries[0];
    if (!entry) continue;
    if (entry.homeAt <= plan.at) problems.push(`the read at ${plan.at} came back before it was made`);
  }

  // The two rules the two cards make, stated as the reader would state them.
  for (const entry of answered) {
    if (entry.ghost) continue;
    if (entry.card === 'c') {
      if (entry.answer !== 'refused' && entry.value !== entry.latest) {
        problems.push(`${entry.homeAt} a read under C was answered with ${entry.value} while ${entry.latest} was the latest`);
      }
      if (entry.answer === 'refused' && !entry.cut) {
        problems.push(`${entry.homeAt} a read under C was refused with the link whole`);
      }
    }
    if (entry.card === 'a') {
      if (entry.answer === 'refused') problems.push(`${entry.homeAt} a read under A went unanswered`);
      if (entry.value !== entry.latest && entry.answer !== 'stale') {
        problems.push(`${entry.homeAt} an old answer under A was not marked stale`);
      }
      if (entry.value === entry.latest && entry.answer === 'stale') {
        problems.push(`${entry.homeAt} a current answer under A was marked stale`);
      }
    }
  }
  if (!answered.some((entry) => entry.card === 'c' && entry.answer === 'refused')) {
    problems.push('the second step never shows a refusal');
  }
  if (!answered.some((entry) => entry.card === 'a' && entry.answer === 'stale')) {
    problems.push('the third step never shows an old answer');
  }

  // What agreement costs, measured rather than asserted.
  const strong = answered.filter((entry) => entry.metered && entry.strong).map((entry) => entry.ms);
  const relaxed = answered.filter((entry) => entry.metered && !entry.strong).map((entry) => entry.ms);
  if (strong.length === 0 || relaxed.length === 0) {
    problems.push('the fourth step does not measure both kinds of read');
  }
  for (const high of strong) {
    for (const low of relaxed) {
      if (high <= low) problems.push(`a strong read measured ${high} ms against a relaxed ${low} ms`);
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
  let counted = 0;
  for (const change of changes) {
    if (change.name !== 'data-cap-ok') continue;
    const value = Number(change.value);
    if (value !== counted + 1) problems.push(`${change.at} the readout went from ok ${counted} to ok ${value}`);
    counted = value;
  }
  const wanted = answered.filter((entry) => !entry.ghost && entry.answer !== 'refused').length;
  if (counted !== wanted) problems.push(`the readout finished on ok ${counted} for ${wanted} answers`);

  // The meter only ever reads something a read actually cost.
  const measured = new Set(answered.filter((entry) => entry.metered).map((entry) => String(entry.ms)));
  for (const change of changes) {
    if (change.name !== 'data-cap-ms') continue;
    if (!measured.has(change.value)) problems.push(`${change.at} the meter read ${change.value}`);
  }

  // A replica only ever moves forward, and `R2` is never given a value while
  // the wire that would have carried it is cut.
  for (const id of ['r1', 'r2'] as const) {
    let reached = VALUE_MIN;
    for (const change of changes) {
      if (change.name !== `data-cap-${id}`) continue;
      const value = Number(change.value);
      if (value <= reached) problems.push(`${change.at} ${id} went from ${reached} to ${value}`);
      reached = value;
    }
  }
  const cutWindows = windowsOf(changes, 'data-cap-link', 'ok', (v) => v === 'cut');
  for (const change of changes) {
    if (change.name !== 'data-cap-r2') continue;
    for (const [from, to] of cutWindows) {
      if (change.at > from + EPS && change.at < to - EPS) {
        problems.push(`${change.at} R2 received a change while the link was cut`);
      }
    }
  }

  // Both replicas agree again once the network has, and every heal converges.
  const ghostWindows = windowsOf(changes, 'data-cap-ghost', 'off', (v) => v === 'on');
  for (const window of PARTITIONS) {
    const settledAt = round(window.to + (window.ghost ? 0 : SYNC));
    const at = (name: string, initial: string): string => {
      let value = initial;
      for (const change of changes) {
        if (change.name === name && change.at <= settledAt + EPS) value = change.value;
      }
      return value;
    };
    if (at('data-cap-r1', String(VALUE_MIN)) !== at('data-cap-r2', String(VALUE_MIN))) {
      problems.push(`${settledAt} the replicas still disagree after the network came back`);
    }
  }

  // Two answers to one question is a thing only the ghost is allowed to show.
  for (const [from, to] of windowsOf(changes, 'data-cap-split', 'off', (v) => v === 'on')) {
    const inside = ghostWindows.some(([gFrom, gTo]) => from >= gFrom - EPS && to <= gTo + EPS);
    if (!inside) problems.push(`${from} the two-answers plate is up outside the ghost`);
  }

  // Every traveller rides one of the three declared lanes, end to end.
  for (const journey of journeys) {
    const span = round(journey.startAt + (journey.returns ? 2 : 1) * journey.leg + journey.dwell);
    if (Math.abs(span - journey.hideAt) > 0.001) {
      problems.push(`a traveller from ${journey.startAt} is taken away at ${journey.hideAt}, not ${span}`);
    }
    const wantX = journey.lane === 'r1' ? X_R1 : journey.lane === 'r2' ? X_R2 : X_VERDICT;
    if (journey.x !== wantX) problems.push(`a ${journey.kind} left its lane at ${journey.startAt}`);
    if (journey.lane === 'verdict' && journey.returns) {
      problems.push(`a verdict came back up at ${journey.startAt}`);
    }
    if (journey.startAt < 0 || journey.hideAt + MARK_FADE > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${journey.startAt}`);
    }
  }

  // Two travellers on one column, measured rather than assumed, and measured
  // across directions because both client lanes carry traffic each way.
  for (const lane of ['r1', 'r2', 'verdict'] as const) {
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

  // Nothing is in flight on a boundary, and nothing is being held up on one.
  for (const edge of BOUNDARIES) {
    for (const journey of journeys) {
      if (journey.startAt < edge + EPS && journey.hideAt + MARK_FADE > edge + EPS) {
        problems.push(`something is in flight on the boundary at ${edge}`);
      }
    }
    for (const [name, initial] of [
      ['data-cap-mark', 'none'],
      ['data-cap-lamp', 'none'],
      ['data-cap-split', 'off'],
      ['data-cap-ghost', 'off'],
    ] as const) {
      let value = initial as string;
      for (const change of changes) {
        if (change.name === name && change.at <= edge + EPS) value = change.value;
      }
      if (value !== initial) problems.push(`${name} reads ${value} on the boundary at ${edge}`);
    }
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${[...new Set(problems)].join('; ')}`);

  journeys.sort((left, right) => left.startAt - right.startAt);
  answered.sort((left, right) => left.homeAt - right.homeAt);

  const splits = windowsOf(changes, 'data-cap-split', 'off', (v) => v === 'on');
  return { changes, cues, journeys, answered, splits };
}

// --- the timeline ----------------------------------------------------------

/**
 * The ring an answer that is not the latest wears around its check, so a stale
 * answer and a fresh one are different shapes and not only different words.
 */
function decorate(parts: RequestParts): void {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  element.setAttribute('class', 'cap-stale-ring');
  element.setAttribute('r', '30');
  parts.group.insertBefore(element, parts.ok);
}

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  if (sim.splits.length !== 1) {
    throw new Error(`${ID} scene: the first step promises one question with two answers`);
  }
  if (sim.answered.filter((entry) => entry.answer === 'refused').length !== 1) {
    throw new Error(`${ID} scene: the second step promises exactly one refusal`);
  }
  if (sim.answered.filter((entry) => entry.answer === 'stale' && !entry.ghost).length !== 1) {
    throw new Error(`${ID} scene: the third step promises exactly one answer marked stale`);
  }
  if (sim.answered.filter((entry) => entry.metered).length !== 3) {
    throw new Error(`${ID} scene: the fourth step promises three measured reads`);
  }

  const parts = mountRequests(layer, sim.journeys.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) {
    if (change.target !== 'stage') {
      throw new Error(`${ID} scene: nothing on the stage is called "${change.target}"`);
    }
    attr(tl, stage, change.name, change.value, change.at);
  }

  // --- what travels --------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;

    request.group.classList.add(`cap-req--${journey.kind}`);

    // An answer that is not the latest wears a ring, put on where the replica
    // hands it over and nowhere else.
    if (journey.answer === 'stale' && journey.markAt !== null) {
      decorate(request);
      request.group.setAttribute('data-cap-answer', 'none');
      attr(tl, request.group, 'data-cap-answer', 'stale', journey.markAt);
    }

    parkRequest(request, journey.x, journey.home);
    showRequest(tl, request, journey.startAt);
    tl.to(
      request.group,
      { y: journey.far, duration: journey.leg, ease: 'none', immediateRender: false },
      journey.startAt,
    );
    if (journey.returns) {
      tl.to(
        request.group,
        { y: journey.home, duration: journey.leg, ease: 'none', immediateRender: false },
        round(journey.startAt + journey.leg + journey.dwell),
      );
    }

    if (journey.markAt !== null) markRequest(tl, request, journey.result, journey.markAt);
    hideRequest(tl, request, journey.hideAt, MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: two replicas holding the same
  // value, a whole `link`, no card chosen, no lamp lit, `ok 0`, no meter and
  // nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
