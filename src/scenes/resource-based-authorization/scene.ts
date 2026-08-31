import gsap from 'gsap';
import {
  DOC_IDS,
  OK_MAX,
  OWNER_OF,
  SCENE_DURATION,
  STAGE_STATE,
  X_LANE,
  Y_CHECK_BOTTOM,
  Y_CHECK_TOP,
  Y_DOCS_TOP,
  Y_USERS_BOTTOM,
} from './stage';
import type { Action, DocId, EditMark, Mark, UserId } from './stage';
import { q, qa } from '../shared/dom';
import { attachToRequest, hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Resource-based Authorization scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing on
 * this stage is a continuous quantity — a tally is a number, a verdict is one of
 * two words, an edit mark is one of three shapes — so scrubbing lands on the
 * value rather than between two.
 *
 * Nothing the reader watches is placed by hand. The scene is told six things:
 * the request schedule, which is a time, a caller, a verb and a document; the
 * window the role-only ghost is up for; when each rule card is written; when the
 * admin badge is granted and to whom; when the new verb appears on a caller; and
 * how fast a traveller moves.
 *
 * Everything else falls out of one pass over those inputs against one rule set,
 * read in a fixed order. The admin card is the named exception and is consulted
 * first: it grants a badge holder the one narrow verb it names, whoever owns the
 * document. Then the owner card, which grants an `edit` only when the document's
 * owner is the caller. Then the share card, once it exists, which grants a
 * `share` on the same condition. If nothing said yes, the answer is no, and that
 * is the fourth step: silence is a refusal rather than an oversight.
 *
 * Five things are checked rather than claimed. The tally never goes backwards.
 * Once the ghost is down, no write lands on a document its author does not own
 * unless the author is wearing the badge. Every refusal leaves both documents
 * exactly as they were. The `share` that arrives before any rule names it never
 * passes, at any speed. And the only wrongful edit in the scene happens inside
 * the ghost window, which is what makes the ghost worth drawing.
 */

const ID = 'resource-based-authorization';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 500;

/** The flight down to the Check, and the flight from the Check to the Docs. */
const LEG_ASK = round((Y_CHECK_TOP - Y_USERS_BOTTOM) / SPEED);
const LEG_WRITE = round((Y_DOCS_TOP - Y_CHECK_BOTTOM) / SPEED);

/** Every traveller here ends on a verdict, so every one is held to be read. */
const MARK_FADE = 0.3;

/** The halo around a traveller, which is what keeps two of them apart. */
const HALO = 26;

// --- what the scene is told ------------------------------------------------

/** One request: who is asking, for what, and about which document. */
interface Ask {
  at: number;
  user: UserId;
  action: Action;
  doc: DocId;
}

/**
 * Every request in the scene. The verdict is not written here: it is the rule
 * set that exists at the instant the request arrives, read against the owner of
 * the document it names.
 */
const REQUESTS: Ask[] = [
  { at: 1.4, user: 'B', action: 'edit', doc: '1' },
  { at: 7.4, user: 'A', action: 'edit', doc: '1' },
  { at: 9.2, user: 'B', action: 'edit', doc: '1' },
  { at: 13.4, user: 'B', action: 'edit', doc: '1' },
  { at: 16.2, user: 'A', action: 'edit', doc: '1' },
  { at: 19.4, user: 'A', action: 'share', doc: '1' },
  { at: 21.6, user: 'A', action: 'share', doc: '1' },
];

/** When the role-only check is raised, and when it is taken down. */
const GHOST_AT = 0.5;
const RESOURCE_AT = 3;

/** When each rule card is written. */
const OWNER_AT = 6.5;
const ADMIN_AT = 12.5;
const SHARE_AT = 21.3;

/** Who the coarse outer gate is granted to, and when. */
const BADGE_USER: UserId = 'B';
const BADGE_AT = 12.5;

/** The one verb the admin card names. A named grant, not a skeleton key. */
const ADMIN_ACTION: Action = 'edit';

/** When the caller that is about to be refused asks for something new. */
const NEW_ACTION_AT = 18.5;
const NEW_ACTION_USER: UserId = 'A';
const NEW_ACTION: Action = 'share';

/**
 * How long a refusal owns the verdict block before the tally comes back. Long
 * enough that the highlight the fourth step puts on the default lands while the
 * block is still saying no, which is the thing the highlight is about.
 */
const DENY_HOLD = 1;

/** How long a document shows that something is landing on it. */
const HIT_HOLD = 0.4;

/** The seven things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark][] = [
  [3.9, 'three'],
  [4.8, 'hand'],
  [10.9, 'answer'],
  [14.4, 'layers'],
  [15.4, 'narrow'],
  [17.1, 'place'],
  [20.4, 'safe'],
];
const MARK_HOLD = 0.6;

/** When the picture is called settled: three rules, and no open door. */
const SETTLE_AT = 22.8;

/** The shortest gap between any two cues, and how quiet a step boundary is. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;
const BOUNDARIES = [0, 6, 12, 18, 24];
const EPS = 1e-9;

// --- what the simulation produces ------------------------------------------

/** Where a discrete change is written: the stage root, or one document card. */
type Target = 'stage' | DocId;

interface AttrChange {
  at: number;
  target: Target;
  name: string;
  value: string;
}

interface Journey {
  from: number;
  to: number;
  kind: 'ask' | 'write';
  user: UserId;
  showAt: number;
  duration: number;
  landAt: number;
  result: RequestResult;
}

/** One request that reached the Check, and what the rule set said about it. */
interface Decision {
  at: number;
  user: UserId;
  action: Action;
  doc: DocId;
  granted: boolean;
  /** Which card said yes, or why nothing did. */
  via: 'ghost' | 'admin' | 'owner' | 'share' | 'none';
  /** True when no rule so much as names the verb that was asked for. */
  unmatched: boolean;
}

/** One granted write that reached a document. */
interface Write {
  at: number;
  user: UserId;
  doc: DocId;
  mark: EditMark;
}

interface Simulation {
  changes: AttrChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  decisions: Decision[];
  writes: Write[];
  okSeries: [number, number][];
  ok: number;
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const fired: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const decisions: Decision[] = [];
  const writes: Write[] = [];
  const okSeries: [number, number][] = [[0, 0]];
  const problems: string[] = [];

  const setAttr = (at: number, target: Target, name: string, value: string): void => {
    raw.push({ at: round(at), target, name, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fired.push([round(at), name]);
  };

  /** Whether the role-only check is the thing deciding right now. */
  let ghost = false;
  /** Which rule cards are written, in the order they were written. */
  let ownerCard = false;
  let adminCard = false;
  let shareCard = false;
  /** Who is wearing the coarse outer gate. */
  const badge: Partial<Record<UserId, boolean>> = {};
  /** Which refusal owns the verdict block, so a stale reset cannot clear it. */
  let denySeq = 0;
  let ok = 0;

  const { schedule, drain } = createScheduler();

  /** The running tally, which is a number rather than a bar. */
  const grant = (at: number): void => {
    ok += 1;
    okSeries.push([round(at), ok]);
    setAttr(at, 'stage', 'data-rba-ok', String(ok));
  };

  /**
   * A refusal owns the block for a moment and then gives it back to the tally.
   * A later refusal takes it over, so the reset only fires for the one that is
   * still current.
   */
  const refuse = (at: number): void => {
    denySeq += 1;
    const mine = denySeq;
    setAttr(at, 'stage', 'data-rba-verdict', 'deny');
    const clears = round(at + DENY_HOLD);
    schedule(clears, () => {
      if (denySeq !== mine) return;
      setAttr(clears, 'stage', 'data-rba-verdict', 'ok');
    });
  };

  /**
   * The rule set, read in one fixed order. The admin card is the named
   * exception and is consulted first; then ownership decides an `edit`; then,
   * once it exists, the same ownership fact decides a `share`. Nothing below
   * this line is a flag: `named` is true only if some card mentions the verb at
   * all, which is what tells an ordinary refusal from an unmatched one.
   */
  const decide = (ask: Ask): { granted: boolean; via: Decision['via']; unmatched: boolean } => {
    if (ghost) return { granted: true, via: 'ghost', unmatched: false };
    let named = false;
    if (adminCard && ADMIN_ACTION === ask.action) {
      named = true;
      if (badge[ask.user]) return { granted: true, via: 'admin', unmatched: false };
    }
    if (ownerCard && ask.action === 'edit') {
      named = true;
      if (OWNER_OF[ask.doc] === ask.user) return { granted: true, via: 'owner', unmatched: false };
    }
    if (shareCard && ask.action === 'share') {
      named = true;
      if (OWNER_OF[ask.doc] === ask.user) return { granted: true, via: 'share', unmatched: false };
    }
    return { granted: false, via: 'none', unmatched: !named };
  };

  // --- everything that is asked --------------------------------------------

  for (const ask of REQUESTS) {
    schedule(ask.at, () => {
      const lands = round(ask.at + LEG_ASK);
      const verdict = decide(ask);

      journeys.push({
        from: Y_USERS_BOTTOM,
        to: Y_CHECK_TOP,
        kind: 'ask',
        user: ask.user,
        showAt: ask.at,
        duration: LEG_ASK,
        landAt: lands,
        result: verdict.granted ? 'ok' : 'fail',
      });

      schedule(lands, () => {
        decisions.push({
          at: lands,
          user: ask.user,
          action: ask.action,
          doc: ask.doc,
          granted: verdict.granted,
          via: verdict.via,
          unmatched: verdict.unmatched,
        });

        if (!verdict.granted) {
          // Nothing travels on. A refusal is a state inside the Check, because
          // a request that was denied never reached the document.
          if (verdict.unmatched) setAttr(lands, 'stage', 'data-rba-share-rule', 'unmatched');
          refuse(lands);
          cue(lands, 'state');
          return;
        }

        grant(lands);
        // The ghost's pass is the defect the first step is about, so it is
        // silent here and sounds where the damage lands.
        if (!ghost) cue(lands, 'success');

        const write = round(lands + LEG_WRITE);
        // A write is wrongful when it changes a document its author does not
        // own and is not wearing the badge that says it may. That is read off
        // the world the write lands in, not written down anywhere.
        const wrongful = OWNER_OF[ask.doc] !== ask.user && !badge[ask.user];
        journeys.push({
          from: Y_CHECK_BOTTOM,
          to: Y_DOCS_TOP,
          kind: 'write',
          user: ask.user,
          showAt: lands,
          duration: LEG_WRITE,
          landAt: write,
          result: wrongful ? 'fail' : 'ok',
        });

        schedule(write, () => {
          const mark: EditMark = wrongful ? 'wrong' : 'ok';
          writes.push({ at: write, user: ask.user, doc: ask.doc, mark });
          setAttr(write, ask.doc, 'data-rba-edit', mark);
          setAttr(write, ask.doc, 'data-rba-hit', 'on');
          if (wrongful) cue(write, 'failure');
          const settles = round(write + HIT_HOLD);
          schedule(settles, () => setAttr(settles, ask.doc, 'data-rba-hit', 'off'));
        });
      });
    });
  }

  // --- the ghost, and the mode it is replaced by ---------------------------

  schedule(GHOST_AT, () => {
    ghost = true;
    setAttr(GHOST_AT, 'stage', 'data-rba-own-rule', 'ghost');
    cue(GHOST_AT, 'state');
  });

  schedule(RESOURCE_AT, () => {
    ghost = false;
    // The role-only card comes down and the owner marks stop being decoration:
    // from here the document is loaded before anything is decided.
    setAttr(RESOURCE_AT, 'stage', 'data-rba-own-rule', 'off');
    setAttr(RESOURCE_AT, 'stage', 'data-rba-mode', 'resource');
    cue(RESOURCE_AT, 'trip');
  });

  // --- the rules, written one at a time ------------------------------------

  schedule(OWNER_AT, () => {
    ownerCard = true;
    setAttr(OWNER_AT, 'stage', 'data-rba-own-rule', 'owner');
    cue(OWNER_AT, 'state');
  });

  schedule(ADMIN_AT, () => {
    adminCard = true;
    setAttr(ADMIN_AT, 'stage', 'data-rba-admin-rule', 'admin');
    cue(ADMIN_AT, 'trip');
  });

  schedule(BADGE_AT, () => {
    badge[BADGE_USER] = true;
    setAttr(BADGE_AT, 'stage', 'data-rba-badge', 'admin');
  });

  schedule(SHARE_AT, () => {
    shareCard = true;
    setAttr(SHARE_AT, 'stage', 'data-rba-share-rule', 'share');
    cue(SHARE_AT, 'state');
  });

  schedule(NEW_ACTION_AT, () => {
    setAttr(NEW_ACTION_AT, 'stage', `data-rba-act-${NEW_ACTION_USER.toLowerCase()}`, NEW_ACTION);
    cue(NEW_ACTION_AT, 'state');
  });

  // --- what the scene holds up, and where it stops -------------------------

  for (const [at, value] of MARK_AT) {
    schedule(at, () => {
      setAttr(at, 'stage', 'data-rba-mark', value);
      cue(at, 'state');
    });
    const ends = round(at + MARK_HOLD);
    schedule(ends, () => setAttr(ends, 'stage', 'data-rba-mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    setAttr(SETTLE_AT, 'stage', 'data-rba-settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  // --- what has to be true for the picture to mean anything ---------------

  // The tally is a tally: it only ever goes up, and it never runs off the top of
  // what the stage can draw.
  for (let i = 1; i < okSeries.length; i += 1) {
    const previous = okSeries[i - 1];
    const current = okSeries[i];
    if (!previous || !current) continue;
    if (current[1] < previous[1]) problems.push(`the tally fell from ${previous[1]} to ${current[1]} at ${current[0]}`);
  }
  if (ok > OK_MAX) problems.push(`the tally reached ${ok}, which the stage cannot draw`);

  // The only write that lands where it should not is the ghost's. After the
  // ghost comes down, a write on somebody else's document needs the badge.
  const wrongful = writes.filter((entry) => entry.mark === 'wrong');
  if (wrongful.length !== 1) problems.push(`${wrongful.length} wrongful edits landed`);
  for (const entry of wrongful) {
    if (entry.at > RESOURCE_AT) problems.push(`a wrongful edit landed at ${entry.at}, after the ghost came down`);
  }
  for (const entry of writes) {
    if (entry.at <= RESOURCE_AT) continue;
    if (OWNER_OF[entry.doc] === entry.user) continue;
    if (!badge[entry.user]) problems.push(`${entry.user} wrote ${entry.doc} at ${entry.at} without owning it`);
  }

  // A refusal changes nothing below the Check: no traveller leaves the box, and
  // no document attribute moves at that instant.
  const denied = decisions.filter((entry) => !entry.granted);
  if (denied.length !== 2) problems.push(`${denied.length} requests were refused`);
  for (const entry of denied) {
    if (journeys.some((leg) => leg.kind === 'write' && leg.showAt === entry.at)) {
      problems.push(`a write left the Check at ${entry.at}, where a request was refused`);
    }
    if (raw.some((change) => change.target !== 'stage' && change.at === entry.at)) {
      problems.push(`a document changed at ${entry.at}, where a request was refused`);
    }
  }

  // The verb no rule has heard of never passes, and it is the only thing that
  // ever lights the unmatched card.
  for (const entry of decisions) {
    if (entry.action === 'share' && entry.at < SHARE_AT && entry.granted) {
      problems.push(`a share passed at ${entry.at}, before any rule named it`);
    }
    if (entry.unmatched && entry.granted) problems.push(`an unmatched request passed at ${entry.at}`);
  }
  const unmatched = decisions.filter((entry) => entry.unmatched);
  if (unmatched.length !== 1) problems.push(`${unmatched.length} requests matched no rule at all`);

  // Every grant names the card that made it, and no card grants before it is
  // written. That is what makes the third and fourth steps arguments rather
  // than assertions.
  for (const entry of decisions) {
    if (entry.via === 'admin' && entry.at < ADMIN_AT) problems.push(`the admin card granted at ${entry.at}`);
    if (entry.via === 'owner' && entry.at < OWNER_AT) problems.push(`the owner card granted at ${entry.at}`);
    if (entry.via === 'share' && entry.at < SHARE_AT) problems.push(`the share card granted at ${entry.at}`);
    if (entry.via === 'ghost' && entry.at > RESOURCE_AT) problems.push(`the ghost granted at ${entry.at}`);
    if (entry.granted && entry.via === 'none') problems.push(`a request passed at ${entry.at} with no card`);
  }

  // Two travellers on one column, closer than their haloes, would read as one.
  for (let a = 0; a < journeys.length; a += 1) {
    for (let b = a + 1; b < journeys.length; b += 1) {
      const left = journeys[a];
      const right = journeys[b];
      if (!left || !right) continue;
      const from = Math.max(left.showAt, right.showAt);
      const to = Math.min(left.landAt + MARK_FADE, right.landAt + MARK_FADE);
      for (let t = from; t <= to; t = round(t + 0.01)) {
        const at = (leg: Journey): number =>
          leg.from + (leg.to - leg.from) * Math.min(1, Math.max(0, (t - leg.showAt) / leg.duration));
        const gap = Math.abs(at(left) - at(right));
        if (gap < HALO * 2) {
          problems.push(`two travellers were ${gap.toFixed(0)}px apart at ${t}`);
          break;
        }
      }
    }
  }
  for (const journey of journeys) {
    if (journey.showAt < 0 || journey.landAt + MARK_FADE > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${journey.showAt}`);
    }
    for (const edge of BOUNDARIES) {
      if (journey.showAt < edge && journey.landAt + MARK_FADE > edge) {
        problems.push(`a traveller crosses the boundary at ${edge}`);
      }
    }
  }

  // A cue on a step boundary belongs to neither step, and two cues on top of
  // each other are one noise. Two of the same kind on one instant are folded,
  // because a card being written and the badge that comes with it are one thing
  // happening.
  fired.sort((left, right) => left[0] - right[0]);
  const cues: [number, SceneCue][] = [];
  for (const entry of fired) {
    const previous = cues[cues.length - 1];
    if (previous && previous[0] === entry[0]) {
      if (previous[1] !== entry[1]) problems.push(`a ${previous[1]} and a ${entry[1]} cue share ${entry[0]}`);
      continue;
    }
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

  // --- the discrete changes, in time order and collapsed ------------------

  // Two changes to one thing at one instant would render in insertion order
  // forwards and in reverse going backwards, so that single frame would depend
  // on which way the reader scrubbed. Only the one that applies is kept.
  const inTimeOrder = raw
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) => left.entry.at - right.entry.at || left.order - right.order)
    .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of inTimeOrder) {
    collapseAtInstant(folded, entry, (change) => `${change.target}|${change.name}`);
  }

  const seen = new Map<string, string>();
  for (const [name, value] of Object.entries(STAGE_STATE)) seen.set(`stage|${name}`, value);
  for (const doc of ['1', '2'] as const) {
    seen.set(`${doc}|data-rba-edit`, 'none');
    seen.set(`${doc}|data-rba-hit`, 'off');
  }
  const changes: AttrChange[] = [];
  for (const change of folded) {
    const key = `${change.target}|${change.name}`;
    if (seen.get(key) === change.value) continue;
    seen.set(key, change.value);
    changes.push(change);
  }

  journeys.sort((left, right) => left.showAt - right.showAt);
  decisions.sort((left, right) => left.at - right.at);

  return { changes, cues, journeys, decisions, writes, okSeries, ok };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);

  // The document cards are addressed in the order the stage draws them, and the
  // owner each one declares is checked against the map the simulation decided
  // by, so the picture and the model cannot drift apart silently.
  const cards = qa<SVGGElement>(stage, '.rba-doc');
  const docs = {} as Record<DocId, SVGGElement>;
  DOC_IDS.forEach((id, index) => {
    const card = cards[index];
    if (!card) throw new Error(`${ID} scene: the stage draws no card for doc ${id}`);
    if (card.getAttribute('data-rba-own') !== OWNER_OF[id]) {
      throw new Error(`${ID} scene: doc ${id} is drawn owned by ${card.getAttribute('data-rba-own')}`);
    }
    docs[id] = card;
  });

  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  const damage = sim.writes.find((entry) => entry.mark === 'wrong');
  if (!damage || damage.at >= 6) throw new Error(`${ID} scene: the wrongful edit did not land in the first step`);
  const split = sim.decisions.filter((entry) => entry.at >= 6 && entry.at < 12);
  if (split.length !== 2 || split[0]?.granted === split[1]?.granted) {
    throw new Error(`${ID} scene: the second step does not answer one request two ways`);
  }
  const byAdmin = sim.decisions.find((entry) => entry.via === 'admin');
  if (!byAdmin || byAdmin.at < 12 || byAdmin.at >= 18) {
    throw new Error(`${ID} scene: the badge did not carry a request in the third step`);
  }
  const silent = sim.decisions.find((entry) => entry.unmatched);
  if (!silent || silent.at < 18) throw new Error(`${ID} scene: the unmatched request did not land in the fourth step`);

  const parts = mountRequests(layer, sim.journeys.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) {
    const target = change.target === 'stage' ? stage : docs[change.target];
    attr(tl, target, change.name, change.value, change.at);
  }

  // --- what travels --------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;

    request.group.classList.add(`rba-req--${journey.kind}`);
    parkRequest(request, X_LANE, journey.from);

    // A traveller carries the name of whoever sent it, because the whole
    // argument is that the same verb from two callers is two different
    // questions. The name gives way to the verdict when one lands.
    const tag = attachToRequest(
      request,
      'text',
      { class: 'scene-mono rba-req-tag', x: '0', y: '9', 'text-anchor': 'middle' },
      journey.user,
    );
    gsap.set(tag, { opacity: 1 });
    gsap.set(request.dot, { opacity: 1 });

    showRequest(tl, request, journey.showAt);
    tl.to(
      request.group,
      { y: journey.to, duration: journey.duration, ease: 'none', immediateRender: false },
      journey.showAt,
    );

    tl.set(tag, { opacity: 0, immediateRender: false }, journey.landAt);
    markRequest(tl, request, journey.result, journey.landAt);
    hideRequest(tl, request, journey.landAt, MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: two callers each asking to edit,
  // no rule card anywhere, a Check that has granted nothing, two documents
  // nobody has written to, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
