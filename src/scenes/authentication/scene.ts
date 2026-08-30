import gsap from 'gsap';
import {
  CLIENT_IDS,
  FAILED_MAX,
  HELD_DX,
  HELD_H,
  HELD_W,
  OK_MAX,
  SCENE_DURATION,
  X_API,
  X_SERVICE,
  X_USER,
  Y_API_TOP,
  Y_CLIENTS_BOTTOM,
  Y_VERIFIER_BOTTOM,
  Y_VERIFIER_TOP,
} from './stage';
import type {
  CheckState,
  ClientId,
  Evidence,
  Mark,
  Method,
  Mode,
  MutualState,
  TagState,
  Verdict,
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
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Authentication scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told four things — the
 * eleven calls, each a `(time, client, evidence)`; the window in which the door
 * asks for a name and nothing else; the instant the proof becomes mutual; and
 * the registry, which says which class of evidence proves which identity. One
 * pass over the whole 24 seconds turns that into everything else: every
 * verdict, `failed n`, `ok n`, which calls reach the API, which of them arrive
 * with a `who` tag on them, what the method plate says, and the settle.
 *
 * Three derivations carry the argument. **The verdict is a function, not a
 * drawing.** One `decide()` reads the mode in force at the instant the evidence
 * reaches the door, the identity being claimed and the class of what was put on
 * the counter. The first step's walk-through is not staged: it is what that
 * function returns when the mode is `ghost`, which is to say when the only
 * question is "what is your name" and there is only one possible answer. The
 * build asserts that nothing at all is refused while the door is dark, and that
 * nothing that arrives in that window carries an identity, because a door that
 * asks nothing establishes nothing.
 *
 * **The Verifier reads the evidence, not the hand holding it.** `stolen` is the
 * right password in the wrong hands, so its class is `password` and `decide()`
 * cannot see any difference — it passes, and the build asserts that it passes
 * exactly once, because that single honest pass is the whole of the second
 * step. Nothing anywhere in the simulation is allowed to consult the difference;
 * the only place the word `stolen` appears in the picture is on the capsule,
 * which is what the reader knows and the door does not.
 *
 * **Mutual means before, not during.** Once the mode is `mtls` the registry is
 * narrowed to certificates, and the Verifier presents one of its own — and the
 * build asserts that both sides are showing `cert` before the first call of
 * that step leaves, because a handshake that happened after the traffic would
 * not be a handshake. `ok` counts calls the API answered and `failed` counts
 * calls the door refused; the two add up to the calls that were made, and the
 * build checks that too.
 */

const ID = 'authentication';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** The Clients-to-Verifier lanes: 200px, whoever is calling. */
const LEG_LANE = 0.26;
/** The Verifier-to-API lane, which is 230px and so a shade longer. */
const LEG_API = 0.3;

/** How long the door holds a piece of evidence while it reads it. */
const CHECK_MS = 0.2;

/** How long the verdict, the presented evidence and the identity tag hold. */
const LAMP_HOLD = 0.3;
const EV_HOLD = 0.3;
const TAG_HOLD = 0.35;

/** How long a traveller takes to fade, and how long a result marker holds. */
const FADE_LEG = 0.1;
const MARK_HOLD = 0.22;
const MARK_FADE = 0.14;

// --- what the scene is told ------------------------------------------------

interface CallPlan {
  at: number;
  client: ClientId;
  evidence: Evidence;
}

/**
 * Every call, and nothing about what happens to it. Which of them reach the API
 * is the mode in force when the evidence lands on the counter and whether the
 * registry knows that class for that identity — neither of which is written
 * here.
 *
 * Three pairs carry the argument. The same bare claim is made twice, at 1.20
 * with a door that only asks for a name and at 2.35 with one that checks, and
 * only the second is refused. The right password and the stolen one are put on
 * the same counter at 6.50 and 7.60, and both pass, because they are the same
 * evidence. And the machine calls twice with nothing at 12.75 and with a key at
 * 13.60: same caller, same door, and the answer moves because it is now holding
 * something.
 */
const CALLS: CallPlan[] = [
  { at: 1.2, client: 'user', evidence: 'none' },
  { at: 2.35, client: 'user', evidence: 'none' },
  { at: 3.0, client: 'user', evidence: 'password' },
  { at: 6.5, client: 'user', evidence: 'password' },
  { at: 7.6, client: 'user', evidence: 'stolen' },
  { at: 12.75, client: 'service', evidence: 'none' },
  { at: 13.6, client: 'service', evidence: 'key' },
  { at: 15.2, client: 'service', evidence: 'key' },
  { at: 19.55, client: 'user', evidence: 'cert' },
  { at: 20.55, client: 'service', evidence: 'cert' },
  { at: 21.3, client: 'user', evidence: 'cert' },
];

/**
 * The ghost window: until here the door asks for a name and takes the answer.
 * It is not a Verifier that happens to be lenient — there is no check at all.
 */
const VERIFY_AT = 2.2;

/** When the proof becomes mutual, and when both sides are showing a certificate. */
const MTLS_AT = 18.5;
const MUTUAL_AT = 19.2;

/**
 * What class of evidence the Verifier reads a piece of evidence as. This is the
 * whole of the second step: a stolen password is a password. Nothing downstream
 * is allowed to look at anything but the class.
 */
type EvidenceClass = 'none' | 'password' | 'key' | 'cert';

const CLASS_OF: Record<Evidence, EvidenceClass> = {
  none: 'none',
  password: 'password',
  stolen: 'password',
  key: 'key',
  cert: 'cert',
};

/** The registry: which classes of evidence prove which identity. */
const REGISTRY: Record<ClientId, readonly EvidenceClass[]> = {
  user: ['password', 'cert'],
  service: ['key', 'cert'],
};

/** When the scene holds something up, for how long, and how it sounds. */
const MARKS: [number, number, Mark, SceneCue][] = [
  [0.5, 0.6, 'ghost', 'state'],
  [4.4, 0.6, 'factors', 'state'],
  [9.4, 0.6, 'evidence', 'state'],
  [10.4, 0.6, 'defense', 'state'],
  [12.5, 0.6, 'nopass', 'state'],
  [16.4, 0.6, 'possession', 'state'],
  [21.75, 0.6, 'wire', 'state'],
];

/** When the picture calls itself settled, once nothing is left to change. */
const SETTLE_AT = 22.6;

/** How close two samples of one repeating thing may sound, how close any cue
    may fall to another, and how close any of it may fall to a boundary. */
const SAMPLE_GAP: Record<string, number> = { answered: 0.45 };
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- the rule the whole scene turns on -------------------------------------

/** How the door is behaving at a given instant. */
function modeAt(at: number): Mode {
  if (at < VERIFY_AT) return 'ghost';
  return at < MTLS_AT ? 'verify' : 'mtls';
}

/**
 * The verdict, and the only place one is ever worked out.
 *
 * A ghost door has no check, so it has one answer. A door that checks needs
 * evidence of a class the registry lists for the identity being claimed, and a
 * claim with nothing behind it fails that on the first line. Once the proof is
 * mutual only a certificate counts, because the thing being trusted is no
 * longer a secret somebody typed but a key neither end ever sent.
 */
function decide(mode: Mode, client: ClientId, evidence: Evidence): Verdict {
  if (mode === 'ghost') return 'who';
  const klass = CLASS_OF[evidence];
  if (klass === 'none') return 'deny';
  if (mode === 'mtls' && klass !== 'cert') return 'deny';
  return REGISTRY[client].includes(klass) ? 'who' : 'deny';
}

/**
 * Whether a call that passed established anything. The ghost door lets a call
 * through without ever learning who made it, and that difference is the first
 * step: the API is answering somebody it cannot name.
 */
const identifies = (mode: Mode): boolean => mode !== 'ghost';

/** The method plate follows the mode first and the evidence class after it. */
function methodFor(mode: Mode, evidence: Evidence): Method | null {
  if (mode === 'mtls') return 'mtls';
  const klass = CLASS_OF[evidence];
  if (klass === 'password') return 'password';
  if (klass === 'key') return 'key';
  return null;
}

// --- what one pass over the scene produces ---------------------------------

/** The three declared segments, each named for what travels down it. */
type Lane = 'user' | 'service' | 'api';

interface Traveller {
  lane: Lane;
  /** What the dot is carrying, because a secret and a held thing differ. */
  carry: Evidence;
  /** Absolute time it leaves its origin, and when it reaches the far edge. */
  start: number;
  arrive: number;
  /** The marker it pops, or nothing for a leg that ends in a plain fade. */
  result: 'ok' | 'fail' | null;
  /** When the marker pops, or when the fade starts. */
  settle: number;
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
  evidence: Record<ClientId, Series[]>;
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the derivation fails loudly. */
  okTotal: number;
  failedTotal: number;
  ghostArrivals: number;
  stolenPasses: number;
}

// --- the simulation --------------------------------------------------------

/**
 * Walks the whole scene in time order.
 *
 * The door's own events — the ghost lifting, the proof becoming mutual, both
 * sides showing a certificate — are booked before the traffic, so a call that
 * arrives reads the rule that is in force at the instant its evidence lands on
 * the counter rather than the one that was in force when it set off. That is
 * the point of the first step: the same bare claim, made again a moment later,
 * meets a door that checks.
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

  let ok = 0;
  let failed = 0;
  /** Calls the ghost door waved through, which are the ones nobody identified. */
  let ghostArrivals = 0;
  /** Passes the stolen password bought, which the scene is about exactly one of. */
  let stolenPasses = 0;
  /** Arrivals in a checking mode that landed without an identity on them. */
  let anonymousArrivals = 0;
  /** The door reads one piece of evidence at a time, so the lamp is unambiguous. */
  let doorBusyUntil = -1;
  /** The first class of each kind is worth a sound; a repeat of it is not. */
  const announced = new Set<Evidence>();
  /** The earliest a call of the mutual step leaves, checked against the handshake. */
  let firstMutualCall = Infinity;

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  record('mode', 0, 'ghost' satisfies Mode);
  record('method', 0, 'none' satisfies Method);
  record('check', 0, 'off' satisfies CheckState);
  record('verdict', 0, 'none' satisfies Verdict);
  record('failed', 0, '0');
  record('ok', 0, '0');
  record('mutual', 0, 'off' satisfies MutualState);
  record('tag', 0, 'off' satisfies TagState);
  record('mark', 0, 'none' satisfies Mark);
  record('settled', 0, 'off');
  for (const client of CLIENT_IDS) record(`ev-${client}`, 0, 'none' satisfies Evidence);

  // --- the door's own events, booked before any traffic --------------------

  // The ghost lifts: the door starts asking for evidence as well as a name.
  // Until this instant it has one question and therefore one possible answer.
  schedule(VERIFY_AT, () => {
    record('mode', VERIFY_AT, 'verify' satisfies Mode);
    fix(VERIFY_AT, 'trip');
  });

  // The proof goes both ways. The method changes before the handshake, because
  // it is the thing that decided there would be one.
  schedule(MTLS_AT, () => {
    record('mode', MTLS_AT, 'mtls' satisfies Mode);
    record('method', MTLS_AT, 'mtls' satisfies Method);
    fix(MTLS_AT, 'trip');
  });

  // Both sides put a certificate on the counter, and neither of them is a call.
  // Once this has happened the connection carries the identity, so the capsules
  // are not cleared again: there is nothing left to present.
  schedule(MUTUAL_AT, () => {
    record('mutual', MUTUAL_AT, 'on' satisfies MutualState);
    for (const client of CLIENT_IDS) record(`ev-${client}`, MUTUAL_AT, 'cert' satisfies Evidence);
    fix(MUTUAL_AT, 'state');
  });

  // --- the traffic ---------------------------------------------------------

  for (const plan of CALLS) {
    schedule(plan.at, () => {
      const lane: Lane = plan.client;
      const arrive = round(plan.at + LEG_LANE);
      if (modeAt(plan.at) === 'mtls') firstMutualCall = Math.min(firstMutualCall, plan.at);

      // What the caller is holding up. A claim with nothing behind it holds up
      // nothing, which is a state of its own and not an empty label.
      if (plan.evidence !== 'none') {
        record(`ev-${plan.client}`, plan.at, plan.evidence);
        if ((plan.evidence === 'stolen' || plan.evidence === 'key') && !announced.has(plan.evidence)) {
          announced.add(plan.evidence);
          fix(plan.at, 'state');
        }
      }

      schedule(arrive, () => {
        const mode = modeAt(arrive);
        const checks = mode !== 'ghost';
        const verdictAt = checks ? round(arrive + CHECK_MS) : arrive;

        if (arrive < doorBusyUntil - EPS) {
          problems.push(`the call at ${plan.at} reached a door still reading the last one`);
        }
        doorBusyUntil = verdictAt;

        // The lamp lights only when something is being read. A door that asks
        // for a name has nothing to light, and the reader has to see that.
        if (checks) {
          record('check', arrive, 'on' satisfies CheckState);
          record('check', verdictAt, 'off' satisfies CheckState);
          const method = methodFor(mode, plan.evidence);
          if (method) record('method', arrive, method);
        }

        const verdict = decide(mode, plan.client, plan.evidence);
        const named = verdict === 'who' && identifies(mode);
        if (checks) record('verdict', verdictAt, verdict);

        if (plan.evidence !== 'none' && mode !== 'mtls') {
          record(`ev-${plan.client}`, round(verdictAt + EV_HOLD), 'none' satisfies Evidence);
        }

        if (verdict === 'deny') {
          failed += 1;
          record('failed', verdictAt, String(failed));
          record('verdict', round(verdictAt + LAMP_HOLD), 'none' satisfies Verdict);
          // A refusal travels nowhere. The call stops on the door's edge and the
          // marker it pops is the whole of what happened to it.
          travellers.push({
            lane,
            carry: plan.evidence,
            start: plan.at,
            arrive,
            result: 'fail',
            settle: verdictAt,
          });
          fix(verdictAt, 'state');
          return;
        }

        if (plan.evidence === 'stolen') stolenPasses += 1;
        if (!identifies(mode)) ghostArrivals += 1;

        travellers.push({
          lane,
          carry: plan.evidence,
          start: plan.at,
          arrive,
          result: null,
          settle: verdictAt,
        });
        const land = round(verdictAt + LEG_API);
        travellers.push({
          lane: 'api',
          carry: plan.evidence,
          start: verdictAt,
          arrive: land,
          result: 'ok',
          settle: land,
        });

        schedule(land, () => {
          ok += 1;
          record('ok', land, String(ok));
          if (checks) record('verdict', round(verdictAt + LAMP_HOLD), 'none' satisfies Verdict);

          // The tag is what the door learned, not what the call asked for. A
          // call the ghost waved through lands with nothing on it, and that is
          // the difference the whole first step is drawing.
          if (named) {
            record('tag', land, 'on' satisfies TagState);
            record('tag', round(land + TAG_HOLD), 'off' satisfies TagState);
          } else {
            anonymousArrivals += 1;
          }

          // A pass that should not have been one still sounds like what it is.
          if (!named || plan.evidence === 'stolen') fix(land, 'failure');
          else sample(land, 'answered', 'success');
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

  if (ok !== OK_MAX) problems.push(`the API answered ${ok} calls and the stage counts to ${OK_MAX}`);
  if (failed !== FAILED_MAX) {
    problems.push(`the door refused ${failed} calls and the stage counts to ${FAILED_MAX}`);
  }
  if (ok + failed !== CALLS.length) {
    problems.push(`${CALLS.length} calls but ${ok} answered and ${failed} refused`);
  }
  if (ghostArrivals !== 1) {
    problems.push(`${ghostArrivals} calls walked past the ghost door, the scene is about exactly one`);
  }
  if (stolenPasses !== 1) {
    problems.push(`the stolen password passed ${stolenPasses} times, the scene is about exactly one`);
  }
  if (anonymousArrivals !== ghostArrivals) {
    problems.push(`${anonymousArrivals} calls landed without an identity but ${ghostArrivals} came through the ghost door`);
  }
  if (firstMutualCall < MUTUAL_AT) {
    problems.push(`a call left at ${firstMutualCall} before both sides had shown a certificate`);
  }

  // The rules, checked as rules rather than as pictures.
  for (const plan of CALLS) {
    const at = round(plan.at + LEG_LANE);
    const mode = modeAt(at);
    const verdict = decide(mode, plan.client, plan.evidence);
    if (mode === 'ghost' && verdict !== 'who') {
      problems.push(`the ghost door refused the call at ${plan.at}, which is the defect it cannot have`);
    }
    if (mode !== 'ghost' && CLASS_OF[plan.evidence] === 'none' && verdict !== 'deny') {
      problems.push(`a claim with no evidence passed at ${plan.at}`);
    }
    if (mode === 'mtls' && verdict === 'who' && CLASS_OF[plan.evidence] !== 'cert') {
      problems.push(`the mutual door passed a non-certificate at ${plan.at}`);
    }
    // The door cannot see the difference, and neither may this build.
    if (plan.evidence === 'stolen' || plan.evidence === 'password') {
      if (decide(mode, plan.client, 'stolen') !== decide(mode, plan.client, 'password')) {
        problems.push(`the check at ${plan.at} told a stolen password from a real one`);
      }
    }
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${problems.join('; ')}`);

  // --- the series, put in time order and collapsed -------------------------

  // Changes are recorded as they are worked out rather than as they happen — an
  // arrival writes the lamp, the method and the verdict's clearing time in one
  // pass — so each key is sorted once here. Two changes to one key at one
  // instant would otherwise render in insertion order forwards and in reverse
  // backwards, so only the one that ends up applying is kept.
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
  for (const key of ['mode', 'method', 'check', 'verdict', 'failed', 'ok', 'mutual', 'tag', 'mark', 'settled']) {
    flags[key] = seriesOf(key);
  }
  const evidence = { user: seriesOf('ev-user'), service: seriesOf('ev-service') };

  // --- the cues ------------------------------------------------------------

  // Same shape as the other scenes: everything the scene has to say is kept,
  // and the one repeating family — a call the door believed reaching the API —
  // is thinned to samples so an arrival is heard often enough to read as a
  // rhythm without becoming one.
  const accepted: Fixed[] = fixed
    .filter((entry) => !BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP - EPS))
    .sort((left, right) => left.at - right.at)
    .filter(
      (entry, index, list) =>
        index === 0 || entry.at - (list[index - 1]?.at ?? -99) >= MIN_CUE_GAP - EPS,
    );
  if (accepted.length !== fixed.length) {
    throw new Error(`${ID} scene: ${fixed.length - accepted.length} cues the scene has to make were crowded out`);
  }

  const lastOf: Record<string, number> = { answered: -99 };
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

  return { flags, evidence, travellers, cues, okTotal: ok, failedTotal: failed, ghostArrivals, stolenPasses };
}

// --- the timeline ----------------------------------------------------------

/** Where a traveller starts, the one coordinate its segment moves, and how far. */
const LANES: Record<Lane, { x: number; y: number; to: number }> = {
  user: { x: X_USER, y: Y_CLIENTS_BOTTOM, to: Y_VERIFIER_TOP },
  service: { x: X_SERVICE, y: Y_CLIENTS_BOTTOM, to: Y_VERIFIER_TOP },
  api: { x: X_API, y: Y_VERIFIER_BOTTOM, to: Y_API_TOP },
};

/** Which kinds of evidence are carried rather than known, and so drawn held. */
const HELD: readonly Evidence[] = ['key', 'cert'];

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const clientElements: Record<ClientId, SVGGElement> = {
    user: q<SVGGElement>(stage, '.an-client--user', ID),
    service: q<SVGGElement>(stage, '.an-client--service', ID),
  };

  const sim = simulate();
  if (sim.okTotal !== OK_MAX || sim.failedTotal !== FAILED_MAX) {
    throw new Error(`${ID} scene: ${sim.okTotal} answered and ${sim.failedTotal} refused`);
  }
  if (sim.ghostArrivals !== 1 || sim.stolenPasses !== 1) {
    throw new Error(`${ID} scene: ${sim.ghostArrivals} ghost arrivals and ${sim.stolenPasses} stolen passes`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-an-${name}`, entry.value, entry.at);
  }
  for (const client of CLIENT_IDS) {
    const element = clientElements[client];
    for (const entry of sim.evidence[client]) attr(tl, element, 'data-an-ev', entry.value, entry.at);
  }

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    // A traveller is drawn as what it is carrying, so a dot already says what
    // kind of evidence is about to be read before it lands anywhere.
    request.group.classList.add(`an-carry--${plan.carry}`);

    parkRequest(request, lane.x, lane.y);

    // Possession is drawn as possession: a key and a certificate ride beside
    // the dot as a plate of their own, far enough out to clear the halo the dot
    // sweeps, because they are things held rather than things known.
    if (HELD.includes(plan.carry)) {
      const held = attachToRequest(request, 'rect', {
        class: `an-held an-held--${plan.carry}`,
        x: String(HELD_DX),
        y: String(-HELD_H / 2),
        width: String(HELD_W),
        height: String(HELD_H),
        rx: '10',
      });
      gsap.set(held, { opacity: 1 });
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
      // A call the door believed is not a result yet: what it did is the dot
      // that leaves the other edge a moment later.
      hideRequest(tl, request, plan.settle, FADE_LEG);
      return;
    }
    markRequest(tl, request, plan.result, plan.settle);
    hideRequest(tl, request, round(plan.settle + MARK_HOLD), MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: two callers holding nothing up, a
  // door with no method and no lamp, no verdict, an API nothing has landed on,
  // and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
