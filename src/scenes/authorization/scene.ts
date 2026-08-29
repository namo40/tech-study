import {
  DENIED_MAX,
  DOC_IDS,
  OK_MAX,
  SCENE_DURATION,
  X_A,
  X_B,
  X_DOCS,
  Y_DOCS_TOP,
  Y_GATE_BOTTOM,
  Y_GATE_TOP,
  Y_USERS_BOTTOM,
} from './stage';
import type {
  AuthnState,
  AuthzState,
  CellState,
  Decision,
  DocId,
  Mark,
  Mode,
  OwnerState,
  Role,
  UserId,
} from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Authorization scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told five things — the
 * eleven requests, each a `(time, user, action, document)`; the window in which
 * the gate has no authorization stage at all; the instant the second stage
 * stops deciding by role and starts deciding by policy; which user owns which
 * document; and which verbs each badge was granted. One pass over the whole 24
 * seconds turns that into everything else: every verdict, `denied n`, `ok n`,
 * which requests reach the Docs box, what each document cell does when one
 * lands on it, and the settle.
 *
 * Three derivations carry the argument. **The verdict is a function, not a
 * drawing.** One `decide()` reads the mode in force at the instant the request
 * reaches the second stage, the badge the caller carries, the verb it asked
 * for, and the owner of the document — and returns allow or deny. The first
 * step's breach is not staged: it is what that function returns when the mode
 * is `ghost`, which is to say when there is no second stage and the answer can
 * only come from "are you signed in". The build asserts that nothing at all is
 * refused while the stage is dark, because that is the defect being shown.
 *
 * **A role knows verbs and a policy knows the resource.** In `role` mode the
 * decision is a function of the badge and the verb only, and the build asserts
 * it: run every request of that window against the other document and the
 * answer must not move. That is why the same editor who may write is allowed to
 * write somebody else's document, and it is the whole reason the third step
 * exists. In `policy` mode a write also has to pass the owner check, and the
 * build asserts the converse: no write to a document its caller does not own is
 * ever allowed once the mode has changed.
 *
 * **Nothing is granted by omission.** A verb no badge lists is refused by the
 * same rule that refuses everything else, so the fourth step's default deny is
 * not a special case in the code — it is the absence of a case. `ok n` counts
 * only what an authorization decision let through, which is why the ghost's
 * successful call leaves it standing still: the document changed and nothing
 * authorized it. `ok`, `denied` and the arrivals the dark gate waved through
 * add up to the number of requests, and the build checks that too.
 */

const ID = 'authorization';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** The Users-to-Gate lanes: 200px, whoever is calling. */
const LEG_LANE = 0.26;
/** The Gate-to-Docs lane, which is 230px and so a shade longer. */
const LEG_DOCS = 0.3;

/** How long the first stage holds a request while it works out who is calling. */
const AUTHN_MS = 0.12;
/** How long the second stage holds it, and how long again when it has to ask
    the resource whose it is. */
const AUTHZ_MS = 0.14;
const AUTHZ_OWNER_MS = 0.3;

/** How long the verdict lamp and a touched document cell hold before clearing. */
const LAMP_HOLD = 0.3;
const CELL_HOLD = 0.3;

/** How long a traveller takes to fade, and how long a result marker holds. */
const FADE_LEG = 0.1;
const MARK_HOLD = 0.22;
const MARK_FADE = 0.14;

// --- what the scene is told ------------------------------------------------

/** What a request asks to do. `admin` is the verb no badge was ever granted. */
type Action = 'read' | 'write' | 'admin';

interface RequestPlan {
  at: number;
  user: UserId;
  action: Action;
  doc: DocId;
}

/**
 * Every request, and nothing about what happens to it. Which of them reach a
 * document is the mode in force when they arrive, the badge, the verb and the
 * owner — none of which is written here.
 *
 * Two pairs carry the argument. B's write of A's document is asked twice, at
 * 1.2 with no authorization stage and at 8.2 with one, and A's write of B's
 * document is asked twice, at 12.5 under `role` and at 14.8 under `policy`.
 * Same caller, same badge, same verb, same document; the answer moves because
 * the rule did.
 */
const REQUESTS: RequestPlan[] = [
  { at: 1.2, user: 'B', action: 'write', doc: 'A' },
  { at: 3.0, user: 'A', action: 'write', doc: 'A' },
  { at: 7.0, user: 'A', action: 'write', doc: 'A' },
  { at: 8.2, user: 'B', action: 'write', doc: 'A' },
  { at: 9.4, user: 'B', action: 'read', doc: 'A' },
  { at: 12.5, user: 'A', action: 'write', doc: 'B' },
  { at: 14.8, user: 'A', action: 'write', doc: 'B' },
  { at: 15.8, user: 'A', action: 'write', doc: 'A' },
  { at: 18.3, user: 'A', action: 'admin', doc: 'A' },
  { at: 20.2, user: 'A', action: 'write', doc: 'A' },
  { at: 20.9, user: 'B', action: 'read', doc: 'B' },
];

/**
 * The ghost window: until here the gate has one stage, so the only question it
 * can ask is whether the caller signed in.
 */
const GHOST_UNTIL = 2.2;

/** When the second stage stops deciding by role and starts deciding by policy. */
const POLICY_AT = 14.0;

/** Who owns what. Nothing but the policy ever reads this. */
const OWNER_OF: Record<DocId, UserId> = { A: 'A', B: 'B' };

/** The badge each caller carries, which is also what the capsules are drawn as. */
const BADGE: Record<UserId, Role> = { A: 'editor', B: 'viewer' };

/** What each badge was granted. A verb absent from a list is not granted. */
const GRANTS: Record<Role, readonly Action[]> = {
  editor: ['read', 'write'],
  viewer: ['read'],
};

/** When the scene holds something up, for how long, and how it sounds. */
const MARKS: [number, number, Mark, SceneCue][] = [
  [0.5, 0.6, 'ghost', 'state'],
  [4.2, 0.6, 'two', 'state'],
  [6.4, 0.6, 'role', 'state'],
  [10.6, 0.6, 'bundle', 'state'],
  [17.1, 0.6, 'resource', 'state'],
  [19.6, 0.6, 'silence', 'state'],
  [22.0, 0.35, 'least', 'state'],
];

/** When the picture calls itself settled, once nothing is left to change. */
const SETTLE_AT = 22.4;

/** How close two samples of one repeating thing may sound, how close any cue
    may fall to another, and how close any of it may fall to a boundary. */
const SAMPLE_GAP: Record<string, number> = { served: 0.45 };
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- the rule the whole scene turns on -------------------------------------

/** Which rule the second stage is deciding by at a given instant. */
function modeAt(at: number): Mode {
  if (at < GHOST_UNTIL) return 'none';
  return at < POLICY_AT ? 'role' : 'policy';
}

/**
 * The verdict, and the only place one is ever worked out.
 *
 * With no second stage the gate can only answer the first question, so it
 * allows. With one, the badge has to list the verb — a verb no badge lists is
 * refused here, which is the whole of default deny — and under `policy` a write
 * also has to be to a document the caller owns. Reads are not narrowed by
 * ownership: both callers may read both documents in both modes, which is what
 * keeps the viewer's read allowed all the way through.
 */
function decide(mode: Mode, user: UserId, action: Action, doc: DocId): Decision {
  if (mode === 'none') return 'allow';
  if (!GRANTS[BADGE[user]].includes(action)) return 'deny';
  if (mode === 'policy' && action === 'write' && OWNER_OF[doc] !== user) return 'deny';
  return 'allow';
}

/** Whether the second stage has to put the question to the resource itself. */
const asksOwner = (mode: Mode, user: UserId, action: Action): boolean =>
  mode === 'policy' && action === 'write' && GRANTS[BADGE[user]].includes(action);

// --- what one pass over the scene produces ---------------------------------

/** The three declared segments, each named for what travels down it. */
type Lane = 'a' | 'b' | 'docs';

interface Traveller {
  lane: Lane;
  /** How the dot is drawn, because a read and a write are not the same ask. */
  action: Action;
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
  cells: Record<DocId, Series[]>;
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the derivation fails loudly. */
  okTotal: number;
  deniedTotal: number;
  darkArrivals: number;
  breaches: number;
}

// --- the simulation --------------------------------------------------------

/**
 * Walks the whole scene in time order.
 *
 * The gate's own events — the ghost lifting, the mode changing — are booked
 * before the traffic, so a request that arrives reads the rule that is in force
 * at the instant it reaches the second stage rather than the one that was in
 * force when it set off. That is the point of the third step: the same request,
 * asked again a moment later, meets a different rule.
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
  let denied = 0;
  /** Calls the dark gate waved through, which are the ones nothing authorized. */
  let darkArrivals = 0;
  /** Calls that landed on a document their caller does not own, however allowed. */
  let breaches = 0;
  /** The gate takes one request at a time, so the stage lamps are unambiguous. */
  let gateBusyUntil = -1;
  let docsTravellers = 0;

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  record('authn', 0, 'idle' satisfies AuthnState);
  record('authz', 0, 'dark' satisfies AuthzState);
  record('mode', 0, 'none' satisfies Mode);
  record('decision', 0, 'none' satisfies Decision);
  record('denied', 0, '0');
  record('ok', 0, '0');
  record('owner', 0, 'off' satisfies OwnerState);
  record('mark', 0, 'none' satisfies Mark);
  record('settled', 0, 'off');
  for (const doc of DOC_IDS) record(`cell-${doc}`, 0, 'idle' satisfies CellState);

  // --- the gate's own events, booked before any traffic --------------------

  // The ghost lifts: a second stage appears, with a rule to decide by. Until
  // this instant the gate has one question and therefore one possible answer.
  schedule(GHOST_UNTIL, () => {
    record('authz', GHOST_UNTIL, 'idle' satisfies AuthzState);
    record('mode', GHOST_UNTIL, 'role' satisfies Mode);
    fix(GHOST_UNTIL, 'trip');
  });

  // The rule changes. Nothing about the callers, their badges or the documents
  // changes with it, which is what makes the re-decided request readable.
  schedule(POLICY_AT, () => {
    record('mode', POLICY_AT, 'policy' satisfies Mode);
    fix(POLICY_AT, 'trip');
  });

  // --- the traffic ---------------------------------------------------------

  for (const plan of REQUESTS) {
    schedule(plan.at, () => {
      const lane: Lane = plan.user === 'A' ? 'a' : 'b';
      const arrive = round(plan.at + LEG_LANE);

      schedule(arrive, () => {
        // The first stage: who is calling. It never refuses anyone in this
        // scene, because both callers are signed in — which is the premise the
        // whole thing is arguing with.
        const authnDone = round(arrive + AUTHN_MS);
        record('authn', arrive, 'busy' satisfies AuthnState);
        record('authn', authnDone, 'idle' satisfies AuthnState);

        const mode = modeAt(authnDone);
        const owns = OWNER_OF[plan.doc] === plan.user;
        const probes = asksOwner(mode, plan.user, plan.action);
        const verdictAt =
          mode === 'none'
            ? authnDone
            : round(authnDone + (probes ? AUTHZ_OWNER_MS : AUTHZ_MS));

        if (arrive < gateBusyUntil - EPS) {
          problems.push(`the request at ${plan.at} reached a gate still deciding the last one`);
        }
        gateBusyUntil = verdictAt;

        // The second stage only lights when there is one. A dark stage and an
        // idle stage are different states and the reader has to see that.
        if (mode !== 'none') {
          record('authz', authnDone, 'busy' satisfies AuthzState);
          record('authz', verdictAt, 'idle' satisfies AuthzState);
        }

        // The owner question is put to the resource itself, so the document is
        // held up while it is asked. A refusal that comes out of that is the
        // policy working, so only the mismatch is worth a sound.
        if (probes) {
          record(`cell-${plan.doc}`, authnDone, 'probe' satisfies CellState);
          record('owner', authnDone, (owns ? 'match' : 'mismatch') satisfies OwnerState);
          if (!owns) fix(authnDone, 'state');
        }

        const verdict = decide(mode, plan.user, plan.action, plan.doc);
        record('decision', verdictAt, verdict);

        if (verdict === 'deny') {
          denied += 1;
          record('denied', verdictAt, String(denied));
          record('decision', round(verdictAt + LAMP_HOLD), 'none' satisfies Decision);
          if (probes) {
            record('owner', verdictAt, 'off' satisfies OwnerState);
            record(`cell-${plan.doc}`, round(verdictAt + CELL_HOLD), 'idle' satisfies CellState);
          }
          // A refusal travels nowhere. The request stops on the gate's edge and
          // the marker it pops is the whole of what happened to it.
          travellers.push({
            lane,
            action: plan.action,
            start: plan.at,
            arrive,
            result: 'fail',
            settle: verdictAt,
          });
          fix(verdictAt, 'state');
          return;
        }

        travellers.push({
          lane,
          action: plan.action,
          start: plan.at,
          arrive,
          result: null,
          settle: verdictAt,
        });
        const land = round(verdictAt + LEG_DOCS);
        docsTravellers += 1;
        travellers.push({
          lane: 'docs',
          action: plan.action,
          start: verdictAt,
          arrive: land,
          result: 'ok',
          settle: land,
        });

        schedule(land, () => {
          // What the document says about a call that landed on it is who made
          // it, not whether the gate was happy. Reading somebody else's page is
          // an ordinary touch; changing it is not, and that is the only thing
          // the cell calls a breach.
          const trespass = !owns && plan.action !== 'read';
          record(`cell-${plan.doc}`, land, (trespass ? 'breach' : 'hit') satisfies CellState);
          record(`cell-${plan.doc}`, round(land + CELL_HOLD), 'idle' satisfies CellState);
          if (probes) record('owner', land, 'off' satisfies OwnerState);
          record('decision', round(land + LAMP_HOLD), 'none' satisfies Decision);

          if (trespass) breaches += 1;
          if (mode === 'none') {
            // Nothing authorized this, so the counter of authorized calls has
            // nothing to add. The document changed all the same.
            darkArrivals += 1;
            fix(land, 'failure');
            return;
          }
          ok += 1;
          record('ok', land, String(ok));
          if (trespass) fix(land, 'failure');
          else sample(land, 'served', 'success');
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

  if (ok !== OK_MAX) problems.push(`the documents answered ${ok} calls and the stage counts to ${OK_MAX}`);
  if (denied !== DENIED_MAX) {
    problems.push(`the gate refused ${denied} calls and the stage counts to ${DENIED_MAX}`);
  }
  if (darkArrivals !== 1) {
    problems.push(`${darkArrivals} calls went through the dark gate, the scene is about exactly one`);
  }
  if (breaches !== 2) {
    problems.push(`${breaches} calls landed on a document they do not own, the scene is about exactly two`);
  }
  if (ok + denied + darkArrivals !== REQUESTS.length) {
    problems.push(
      `${REQUESTS.length} requests but ${ok} allowed, ${denied} refused and ${darkArrivals} unauthorized`,
    );
  }
  if (docsTravellers !== ok + darkArrivals) {
    problems.push(`${docsTravellers} travellers reached the documents but ${ok + darkArrivals} calls were let through`);
  }

  // The three rules, checked as rules rather than as pictures.
  for (const plan of REQUESTS) {
    const at = round(plan.at + LEG_LANE + AUTHN_MS);
    const mode = modeAt(at);
    const verdict = decide(mode, plan.user, plan.action, plan.doc);
    if (mode === 'none' && verdict !== 'allow') {
      problems.push(`the dark gate refused the request at ${plan.at}, which is the defect it cannot have`);
    }
    if (mode === 'role') {
      const other: DocId = plan.doc === 'A' ? 'B' : 'A';
      if (decide('role', plan.user, plan.action, other) !== verdict) {
        problems.push(`the role decision at ${plan.at} depended on which document was asked for`);
      }
    }
    if (mode === 'policy' && plan.action === 'write' && OWNER_OF[plan.doc] !== plan.user) {
      if (verdict !== 'deny') problems.push(`the policy allowed the write to doc ${plan.doc} at ${plan.at}`);
    }
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${problems.join('; ')}`);

  // --- the series, put in time order and collapsed -------------------------

  // Changes are recorded as they are worked out rather than as they happen — an
  // arrival writes a cell, a readout and the lamp's clearing time in one pass —
  // so each key is sorted once here. Two changes to one key at one instant
  // would otherwise render in insertion order forwards and in reverse
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
  for (const key of ['authn', 'authz', 'mode', 'decision', 'denied', 'ok', 'owner', 'mark', 'settled']) {
    flags[key] = seriesOf(key);
  }
  const cells = { A: seriesOf('cell-A'), B: seriesOf('cell-B') };

  // --- the cues ------------------------------------------------------------

  // Same shape as the other scenes: everything the scene has to say is kept,
  // and the one repeating family — a call the gate allowed reaching its
  // document — is thinned to samples so an arrival is heard often enough to
  // read as a rhythm without becoming one.
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
    okTotal: ok,
    deniedTotal: denied,
    darkArrivals,
    breaches,
  };
}

// --- the timeline ----------------------------------------------------------

/** Where a traveller starts, the one coordinate its segment moves, and how far. */
const LANES: Record<Lane, { x: number; y: number; to: number }> = {
  a: { x: X_A, y: Y_USERS_BOTTOM, to: Y_GATE_TOP },
  b: { x: X_B, y: Y_USERS_BOTTOM, to: Y_GATE_TOP },
  docs: { x: X_DOCS, y: Y_GATE_BOTTOM, to: Y_DOCS_TOP },
};

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const cellElements: Record<DocId, SVGRectElement> = {
    A: q<SVGRectElement>(stage, '.az-cell--A', ID),
    B: q<SVGRectElement>(stage, '.az-cell--B', ID),
  };

  const sim = simulate();
  if (sim.okTotal !== OK_MAX || sim.deniedTotal !== DENIED_MAX) {
    throw new Error(`${ID} scene: ${sim.okTotal} allowed and ${sim.deniedTotal} refused`);
  }
  if (sim.darkArrivals !== 1 || sim.breaches !== 2) {
    throw new Error(`${ID} scene: ${sim.darkArrivals} unauthorized arrivals and ${sim.breaches} breaches`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-az-${name}`, entry.value, entry.at);
  }
  for (const doc of DOC_IDS) {
    const element = cellElements[doc];
    for (const entry of sim.cells[doc]) attr(tl, element, 'data-az-cell', entry.value, entry.at);
  }

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    // A read and a write are drawn apart, because the argument the scene makes
    // is about them differing: the same badge that may read may not write, and
    // the verb no badge lists is drawn as neither.
    request.group.classList.add(`az-${plan.action}`);

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
      // A call the gate allowed is not a result yet: what it did is the cell it
      // lights at the other end of the next segment.
      hideRequest(tl, request, plan.settle, FADE_LEG);
      return;
    }
    markRequest(tl, request, plan.result, plan.settle);
    hideRequest(tl, request, round(plan.settle + MARK_HOLD), MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: two badged callers, a gate whose
  // second stage is not there, no verdict, no document touched, nothing in
  // flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
