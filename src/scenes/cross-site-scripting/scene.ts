import gsap from 'gsap';
import {
  FACE_ATTR,
  OK_MAX,
  READERS,
  SCENE_DURATION,
  SPIKE_POINTS,
  STAGE_STATE,
  X_LANE,
  Y_APP_BOTTOM,
  Y_APP_TOP,
  Y_BROWSER_TOP,
  Y_USERS_BOTTOM,
} from './stage';
import type { FaceState, Mark, Mode, PageState, Shape } from './stage';
import { q } from '../shared/dom';
import { attachToRequest, hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import type { RequestParts, RequestResult } from '../shared/request';
import { collapseAtInstant, createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Cross-site Scripting scene: a 24 second, four step timeline.
 *
 * The same two rules as every other scene: every tween sits at an absolute
 * position, and every discrete change is a zero-duration tween on a `data-*`
 * attribute that GSAP reverts when the playhead moves back past it. Nothing on
 * this stage is a continuous quantity — a page is showing one of four things and
 * a seal is in one of three states — so scrubbing lands on the value rather than
 * between two.
 *
 * Nothing the reader watches is placed by hand. The scene is told six things:
 * when a comment is written and what shape it has, when each reader opens the
 * page and which comment they are looking at, when the way out stops handing
 * markup on untouched, when the three output contexts are put up and sealed,
 * when the raw door is shown and when something hits it, and how fast a
 * traveller moves.
 *
 * Everything else falls out of one pass over those inputs. Whether a page runs
 * what it was given or displays it is the mode at the instant the value reached
 * the pipe, not a flag; how long the value spends inside the pipe is whether
 * there is a comb across it; what the readers see is what came back to them; and
 * the `ok n` readout is the count of pages that were served with nothing
 * executing in them.
 *
 * Six things are checked rather than claimed. The `run` lamp lights only before
 * the mode changes, and never once after it — there is no execution anywhere in
 * the last twenty-one seconds. No value that went through the comb ever ran. The
 * stored comment is set once and is identical at every step boundary from the
 * second on, because encoding happens on the way out and the original is left
 * alone. The cookie leak never appears without the lamp. The raw door, once
 * drawn, is never anything but shut. And the context panel and the door never
 * share the screen, because they share the ground they are drawn on.
 */

const ID = 'cross-site-scripting';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

// --- how a traveller moves -------------------------------------------------

/** One speed for every leg any traveller takes, in pixels per second. */
const SPEED = 575;

/** Users down to the App, and the App down to the Browser. */
const LEG_IN = round((Y_APP_TOP - Y_USERS_BOTTOM) / SPEED);
const LEG_OUT = round((Y_BROWSER_TOP - Y_APP_BOTTOM) / SPEED);

/** How long a traveller that carried no verdict takes to go. */
const FADE = 0.14;
/** A traveller wearing a verdict is held longer, because it is meant to be read. */
const MARK_FADE = 0.3;
/** The halo around a traveller, which is what keeps two of them apart. */
const HALO = 26;

// --- what the scene is told ------------------------------------------------

/** One comment being written, and the shape it has. */
interface Comment {
  at: number;
  shape: Shape;
}

/**
 * Everything anybody writes. Only the first one is kept in the `store` card: it
 * is the comment this scene follows, and the whole point of the second step is
 * that it is never altered. The ordinary ones travel the same road and are taken
 * in without ceremony, which is what ordinary traffic looks like.
 */
const COMMENTS: Comment[] = [
  { at: 0.5, shape: 'spiky' },
  { at: 4.2, shape: 'plain' },
  { at: 9, shape: 'plain' },
  { at: 12.9, shape: 'plain' },
  { at: 14.8, shape: 'plain' },
  { at: 20.8, shape: 'plain' },
];

/** One reader opening the page, and which comment they land on. */
interface View {
  at: number;
  by: number;
  reads: 'stored' | 'plain';
}

/**
 * Every page anybody opens. What comes back is not written here: it is the mode
 * at the moment the value reaches the pipe, applied to the shape of what they
 * are looking at.
 */
const VIEWS: View[] = [
  { at: 1.652, by: 0, reads: 'stored' },
  { at: 6.152, by: 1, reads: 'stored' },
  { at: 8.152, by: 2, reads: 'plain' },
  { at: 18.752, by: 0, reads: 'plain' },
  { at: 19.752, by: 1, reads: 'plain' },
];

/** How long before it leaves, a comment is visible sitting in the capsule. */
const DRAFT_LEAD = 0.3;

/** How long the App takes to put an arrived comment away. */
const STORE_DELAY = 0.45;

/** When the replay of the world without encoding is raised, and when it ends. */
const GHOST_AT = 0.5;
const TRIP_AT = 3;

/** How long a value that meets the comb spends inside the pipe, and when the
 *  `encode` marker lights while it is in there. */
const ENCODE_HOLD = 1.5;
const ENCODE_LIGHT = 0.9;

/** When the three output contexts go up, and when each is sealed by its own rules. */
const CTX_AT = 12.5;
const SEAL_AT: [number, 'body' | 'attr' | 'url'][] = [
  [13.4, 'body'],
  [14.4, 'attr'],
  [15.4, 'url'],
];

/** When the attribute row is shown wearing somebody else's seal, and for how long. */
const WRONG_AT = 16.2;
const WRONG_HOLD = 0.6;

/** When the raw door is drawn, when something hits it, and how long the burst holds. */
const RAW_AT = 18.5;
const RAW_HIT_AT = 19.4;
const RAW_HIT_HOLD = 0.6;

/** When the attempt the policy net catches lands in the Browser. */
const NET_AT = 20.2;

/** The five things the scene holds up, and how long each is held for. */
const MARK_AT: [number, Mark][] = [
  [3.9, 'become'],
  [4.8, 'victim'],
  [9.4, 'output'],
  [11, 'edge'],
  [17, 'where'],
];
const MARK_HOLD = 0.6;

/** When the picture is called settled: encoded output, a shut door, a net. */
const SETTLE_AT = 22.4;

/** The shortest gap between any two cues, and how quiet a step boundary is. */
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;
const BOUNDARIES = [0, 6, 12, 18, 24];
const EPS = 1e-9;

// --- what the simulation produces ------------------------------------------

/** One discrete change to the stage root. */
interface AttrChange {
  at: number;
  name: string;
  value: string;
}

/** One discrete change to a single reader's capsule. */
interface FaceChange {
  at: number;
  index: number;
  value: FaceState;
}

/** How a traveller is drawn, which says what kind of thing it is carrying. */
type Kind = Shape | 'view' | 'exec' | 'safe' | 'leak';

interface Journey {
  from: number;
  to: number;
  kind: Kind;
  showAt: number;
  duration: number;
  landAt: number;
  result: RequestResult | null;
}

/** One page that was served, and what the browser did with it. */
interface Served {
  renderAt: number;
  landAt: number;
  mode: Mode;
  content: Shape;
  outcome: 'exec' | 'text';
  by: number;
}

interface Simulation {
  changes: AttrChange[];
  faces: FaceChange[];
  cues: [number, SceneCue][];
  journeys: Journey[];
  served: Served[];
  okSeries: [number, number][];
  storeSeries: [number, string][];
  runOn: number[];
  ok: number;
}

// --- the simulation --------------------------------------------------------

function simulate(): Simulation {
  const raw: AttrChange[] = [];
  const rawFaces: FaceChange[] = [];
  const fired: [number, SceneCue][] = [];
  const journeys: Journey[] = [];
  const served: Served[] = [];
  const okSeries: [number, number][] = [[0, 0]];
  const storeSeries: [number, string][] = [[0, 'none']];
  const runOn: number[] = [];
  const problems: string[] = [];

  const setAttr = (at: number, name: string, value: string): void => {
    raw.push({ at: round(at), name, value });
  };
  const setFace = (at: number, index: number, value: FaceState): void => {
    rawFaces.push({ at: round(at), index, value });
  };
  const cue = (at: number, name: SceneCue): void => {
    fired.push([round(at), name]);
  };

  /** What the way out is doing to values right now. */
  let mode: Mode = 'plain';
  /** Whether the world on screen is a replay rather than the truth. */
  let ghost = false;
  /** Whether the comment this scene follows is in the store yet. */
  let stored = false;
  /** How many values are inside the pipe, so the last one out clears it. */
  let inPipe = 0;
  /** How many of those are past the comb, so the marker holds while any is. */
  let lit = 0;
  let ok = 0;
  /** Which page state owns the display, so a stale clear cannot take it. */
  let displaySeq = 0;

  const { schedule, drain } = createScheduler();

  const setOk = (at: number, value: number): void => {
    okSeries.push([round(at), value]);
    setAttr(at, 'data-xss-ok', String(value));
  };

  const setPage = (at: number, value: PageState): void => {
    displaySeq += 1;
    setAttr(at, 'data-xss-page', value);
  };

  // --- everything anybody writes -------------------------------------------

  for (const comment of COMMENTS) {
    const shows = round(comment.at - DRAFT_LEAD);
    schedule(shows, () => setAttr(shows, 'data-xss-draft', comment.shape));

    schedule(comment.at, () => {
      const lands = round(comment.at + LEG_IN);
      setAttr(comment.at, 'data-xss-draft', 'none');
      journeys.push({
        from: Y_USERS_BOTTOM,
        to: Y_APP_TOP,
        kind: comment.shape,
        showAt: comment.at,
        duration: LEG_IN,
        landAt: lands,
        result: null,
      });
      // A comment carrying markup is worth noticing as it goes; an ordinary one
      // is not, and neither is anything else that happens to it on the way.
      if (comment.shape === 'spiky') cue(comment.at, 'state');

      if (comment.shape !== 'spiky') return;
      const puts = round(lands + STORE_DELAY);
      schedule(puts, () => {
        stored = true;
        storeSeries.push([puts, 'held']);
        setAttr(puts, 'data-xss-store', 'held');
        cue(puts, 'state');
      });
    });
  }

  // --- every page anybody opens --------------------------------------------

  for (const view of VIEWS) {
    schedule(view.at, () => {
      const renderAt = round(view.at + LEG_IN);
      setFace(view.at, view.by, 'view');
      journeys.push({
        from: Y_USERS_BOTTOM,
        to: Y_APP_TOP,
        kind: 'view',
        showAt: view.at,
        duration: LEG_IN,
        landAt: renderAt,
        result: null,
      });
      if (view.reads === 'stored' && !stored) {
        problems.push(`a reader opened the stored comment at ${view.at} before it was stored`);
      }

      schedule(renderAt, () => {
        // What comes out is the mode applied to the shape of what went in.
        // Nothing here is authored: the same comment is a script in one world
        // and a row of letters in the other, and only the pipe changed.
        const content: Shape = view.reads === 'stored' ? 'spiky' : 'plain';
        const at = mode;
        const outcome: 'exec' | 'text' = content === 'spiky' && at === 'plain' ? 'exec' : 'text';
        const hold = at === 'encode' ? ENCODE_HOLD : 0;
        const departs = round(renderAt + hold);
        const lands = round(departs + LEG_OUT);
        served.push({ renderAt, landAt: lands, mode: at, content, outcome, by: view.by });

        inPipe += 1;
        setAttr(renderAt, 'data-xss-hold', content);
        if (content === 'spiky') cue(renderAt, 'state');

        if (hold > 0) {
          const lights = round(renderAt + ENCODE_LIGHT);
          schedule(lights, () => {
            lit += 1;
            setAttr(lights, 'data-xss-encode', 'on');
            if (content === 'spiky') cue(lights, 'state');
          });
        }

        schedule(departs, () => {
          inPipe -= 1;
          if (inPipe === 0) setAttr(departs, 'data-xss-hold', 'none');
          if (hold > 0) {
            lit -= 1;
            if (lit === 0) setAttr(departs, 'data-xss-encode', 'off');
          }
          journeys.push({
            from: Y_APP_BOTTOM,
            to: Y_BROWSER_TOP,
            kind: outcome === 'exec' ? 'exec' : 'safe',
            showAt: departs,
            duration: LEG_OUT,
            landAt: lands,
            result: outcome === 'exec' ? 'fail' : 'ok',
          });
        });

        schedule(lands, () => {
          if (outcome === 'exec') {
            // The page did what the comment told it to, with the reader's own
            // session. This is the only moment in the scene where that is true.
            runOn.push(lands);
            setPage(lands, 'script');
            setAttr(lands, 'data-xss-run', 'on');
            setAttr(lands, 'data-xss-cookie', 'on');
            setFace(lands, view.by, 'hit');
            cue(lands, 'failure');
            return;
          }
          ok += 1;
          setPage(lands, 'text');
          setOk(lands, ok);
          setFace(lands, view.by, 'idle');
          cue(lands, 'success');
        });
      });
    });
  }

  // --- the replay, and the mode it is replaced by --------------------------

  schedule(GHOST_AT, () => {
    ghost = true;
    setAttr(GHOST_AT, 'data-xss-ghost', 'on');
    cue(GHOST_AT, 'state');
  });

  schedule(TRIP_AT, () => {
    ghost = false;
    mode = 'encode';
    // The replay is withdrawn, and everything it produced goes with it: nothing
    // has really run. What is left is a way out that encodes for its context.
    setAttr(TRIP_AT, 'data-xss-ghost', 'off');
    setAttr(TRIP_AT, 'data-xss-mode', 'encode');
    setAttr(TRIP_AT, 'data-xss-run', 'off');
    setAttr(TRIP_AT, 'data-xss-cookie', 'off');
    setPage(TRIP_AT, 'blank');
    for (let index = 0; index < READERS; index += 1) setFace(TRIP_AT, index, 'idle');
    cue(TRIP_AT, 'trip');
  });

  // --- what the destination decides ----------------------------------------

  schedule(CTX_AT, () => {
    setAttr(CTX_AT, 'data-xss-ctx', 'on');
    cue(CTX_AT, 'state');
  });

  for (const [at, row] of SEAL_AT) {
    schedule(at, () => {
      setAttr(at, `data-xss-${row}`, 'sealed');
      // The first one is the one that turns markup into letters on the page, so
      // it is the one that sounds like something going right.
      cue(at, row === 'body' ? 'success' : 'state');
    });
  }

  schedule(WRONG_AT, () => {
    setAttr(WRONG_AT, 'data-xss-attr', 'wrong');
    cue(WRONG_AT, 'state');
    const ends = round(WRONG_AT + WRONG_HOLD);
    schedule(ends, () => setAttr(ends, 'data-xss-attr', 'sealed'));
  });

  // --- the escape hatch, and the net under it ------------------------------

  schedule(RAW_AT, () => {
    setAttr(RAW_AT, 'data-xss-ctx', 'off');
    setAttr(RAW_AT, 'data-xss-raw', 'shut');
    cue(RAW_AT, 'state');
  });

  schedule(RAW_HIT_AT, () => {
    setAttr(RAW_HIT_AT, 'data-xss-raw', 'hit');
    cue(RAW_HIT_AT, 'state');
    const ends = round(RAW_HIT_AT + RAW_HIT_HOLD);
    schedule(ends, () => setAttr(ends, 'data-xss-raw', 'shut'));
  });

  schedule(round(NET_AT - LEG_OUT), () => {
    const leaves = round(NET_AT - LEG_OUT);
    journeys.push({
      from: Y_APP_BOTTOM,
      to: Y_BROWSER_TOP,
      kind: 'leak',
      showAt: leaves,
      duration: LEG_OUT,
      landAt: NET_AT,
      result: 'fail',
    });
    schedule(NET_AT, () => {
      // Markup that got past everything upstream still has to get past the
      // browser, and the browser was told which scripts are legitimate.
      setAttr(NET_AT, 'data-xss-net', 'on');
      setPage(NET_AT, 'held');
      cue(NET_AT, 'state');
    });
  });

  // --- what the scene holds up, and where it stops -------------------------

  for (const [at, value] of MARK_AT) {
    schedule(at, () => {
      setAttr(at, 'data-xss-mark', value);
      cue(at, 'state');
    });
    const ends = round(at + MARK_HOLD);
    schedule(ends, () => setAttr(ends, 'data-xss-mark', 'none'));
  }

  schedule(SETTLE_AT, () => {
    setAttr(SETTLE_AT, 'data-xss-settled', 'on');
    cue(SETTLE_AT, 'success');
  });

  drain();

  if (displaySeq === 0) problems.push('nothing was ever shown on the page');
  if (ghost) problems.push('the scene ends inside the replay');
  if (inPipe !== 0) problems.push(`${inPipe} values were left inside the pipe`);
  if (lit !== 0) problems.push('the encode marker was left lit');

  // --- what has to be true for the picture to mean anything ---------------

  // The lamp lights only inside the replay, and never once after it. There is no
  // execution anywhere in the last twenty-one seconds of this scene, and that is
  // read off the run rather than asserted in a caption.
  for (const at of runOn) {
    if (at >= TRIP_AT) problems.push(`the run lamp lit at ${at}, after the mode changed`);
    if (at < GHOST_AT) problems.push(`the run lamp lit at ${at}, before the replay was raised`);
  }
  if (runOn.length !== 1) problems.push(`the run lamp lit ${runOn.length} times`);

  // Nothing that went through the comb ever ran, whatever shape it had.
  for (const page of served) {
    if (page.mode === 'encode' && page.outcome !== 'text') {
      problems.push(`an encoded page at ${page.landAt} did not come out as text`);
    }
    if (page.outcome === 'exec' && page.content !== 'spiky') {
      problems.push(`an ordinary comment executed at ${page.landAt}`);
    }
  }
  const encoded = served.filter((page) => page.mode === 'encode');
  if (encoded.length < 4) problems.push(`only ${encoded.length} pages went through the comb`);
  const executed = served.filter((page) => page.outcome === 'exec');
  if (executed.length !== 1) problems.push(`${executed.length} pages ran what they were given`);

  // The stored comment is written once and never touched again, because encoding
  // happens on the way out. This is the whole argument of the second step.
  const storeChanges = raw.filter((change) => change.name === 'data-xss-store');
  if (storeChanges.length !== 1) problems.push(`the store changed ${storeChanges.length} times`);
  if (storeChanges[0]?.value !== 'held') problems.push('the store did not end up holding the comment');
  for (const edge of [6, 12, 18, 24]) {
    const value = storeSeries.filter(([at]) => at <= edge).at(-1)?.[1];
    if (value !== 'held') problems.push(`the store held ${value} at the boundary ${edge}`);
  }

  // The leak never appears without the lamp, and both go out with the replay.
  const cookieOn = raw.filter((change) => change.name === 'data-xss-cookie' && change.value === 'on');
  if (cookieOn.length !== runOn.length) problems.push('the cookie leak and the run lamp disagree');
  for (const change of cookieOn) {
    if (!runOn.includes(change.at)) problems.push(`the cookie leak appeared alone at ${change.at}`);
  }

  // The marker never lights before there is anything to encode with.
  for (const change of raw) {
    if (change.name === 'data-xss-encode' && change.value === 'on' && change.at < TRIP_AT) {
      problems.push(`the encode marker lit at ${change.at}, before the mode changed`);
    }
  }

  // Once the door is drawn it is only ever shut, or shut with something hitting
  // it. There is no state in this scene in which raw output is open.
  const rawChanges = raw.filter((change) => change.name === 'data-xss-raw');
  for (const change of rawChanges) {
    if (change.at < RAW_AT) problems.push(`the raw door appeared at ${change.at}`);
    if (change.value !== 'shut' && change.value !== 'hit') {
      problems.push(`the raw door took the value ${change.value}`);
    }
  }

  // The context rows and the door share the ground they are drawn on, so they
  // are never up at once.
  const ctxOn = raw.filter((change) => change.name === 'data-xss-ctx' && change.value === 'on');
  const ctxOff = raw.filter((change) => change.name === 'data-xss-ctx' && change.value === 'off');
  if (ctxOn.length !== 1 || ctxOff.length !== 1) problems.push('the context panel went up more than once');
  if ((ctxOff[0]?.at ?? 0) > (rawChanges[0]?.at ?? 0)) problems.push('the door and the context rows overlap');

  // The readout only ever climbs, and only ever to a number the stage can draw.
  let last = 0;
  for (const [at, value] of okSeries) {
    if (value < last) problems.push(`the ok readout fell to ${value} at ${at}`);
    if (value > OK_MAX) problems.push(`the ok readout reached ${value}, which is not a drawn value`);
    last = value;
  }
  if (last !== served.filter((page) => page.outcome === 'text').length) {
    problems.push(`the ok readout ended on ${last} with ${served.length} pages served`);
  }

  // Two travellers on one column, closer than their haloes, would read as one.
  const byLane = new Map<number, Journey[]>();
  for (const journey of journeys) {
    const lane = byLane.get(journey.from) ?? [];
    lane.push(journey);
    byLane.set(journey.from, lane);
  }
  for (const lane of byLane.values()) {
    const sorted = [...lane].sort((left, right) => left.showAt - right.showAt);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (!previous || !current) continue;
      const previousGone = previous.landAt + (previous.result ? MARK_FADE : FADE);
      if (current.showAt >= previousGone) continue;
      for (let t = current.showAt; t <= previousGone; t = round(t + 0.01)) {
        const a =
          previous.from +
          (previous.to - previous.from) * Math.min(1, Math.max(0, (t - previous.showAt) / previous.duration));
        const b =
          current.from +
          (current.to - current.from) * Math.min(1, Math.max(0, (t - current.showAt) / current.duration));
        if (Math.abs(a - b) < HALO * 2) {
          problems.push(`two travellers were ${Math.abs(a - b).toFixed(0)}px apart at ${t}`);
          break;
        }
      }
    }
  }
  for (const journey of journeys) {
    if (journey.showAt < 0 || journey.landAt > SCENE_DURATION) {
      problems.push(`a traveller runs off the end of the scene at ${journey.showAt}`);
    }
    for (const edge of BOUNDARIES) {
      const gone = journey.landAt + (journey.result ? MARK_FADE : FADE);
      if (journey.showAt < edge && gone > edge) problems.push(`a traveller crosses the boundary at ${edge}`);
    }
  }

  // A cue on a step boundary belongs to neither step, and two cues on top of
  // each other are one noise. Two of the same kind on one instant are folded,
  // because the replay being raised and the comment it is about being written
  // are one thing happening.
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
  const order = <T extends { at: number }>(list: T[]): T[] =>
    list
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => left.entry.at - right.entry.at || left.index - right.index)
      .map(({ entry }) => entry);

  const folded: AttrChange[] = [];
  for (const entry of order(raw)) collapseAtInstant(folded, entry, (change) => change.name);

  const seen = new Map<string, string>(Object.entries(STAGE_STATE));
  const changes: AttrChange[] = [];
  for (const change of folded) {
    if (seen.get(change.name) === change.value) continue;
    seen.set(change.name, change.value);
    changes.push(change);
  }

  const foldedFaces: FaceChange[] = [];
  for (const entry of order(rawFaces)) collapseAtInstant(foldedFaces, entry, (change) => change.index);

  const held = new Map<number, FaceState>();
  for (let index = 0; index < READERS; index += 1) held.set(index, 'idle');
  const faces: FaceChange[] = [];
  for (const change of foldedFaces) {
    if (held.get(change.index) === change.value) continue;
    held.set(change.index, change.value);
    faces.push(change);
  }

  journeys.sort((left, right) => left.showAt - right.showAt);

  return { changes, faces, cues, journeys, served, okSeries, storeSeries, runOn, ok };
}

// --- the timeline ----------------------------------------------------------

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const readers = Array.from({ length: READERS }, (_value, index) =>
    q<SVGGElement>(stage, `.xss-reader--${index}`, ID),
  );
  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the schedule changes, this is what says the captions have stopped
  // describing the scene.
  const ran = sim.served.find((page) => page.outcome === 'exec');
  if (!ran || ran.landAt >= 6) throw new Error(`${ID} scene: nothing ran inside the first step`);
  const demoted = sim.served.find((page) => page.content === 'spiky' && page.outcome === 'text');
  if (!demoted || demoted.landAt < 6 || demoted.landAt >= 12) {
    throw new Error(`${ID} scene: the same comment did not come back as text in the second step`);
  }
  if (sim.ok < 3) throw new Error(`${ID} scene: only ${sim.ok} pages came back safe`);

  const parts = mountRequests(layer, sim.journeys.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) attr(tl, stage, change.name, change.value, change.at);
  for (const change of sim.faces) {
    const reader = readers[change.index];
    if (reader) attr(tl, reader, FACE_ATTR, change.value, change.at);
  }

  // --- what travels --------------------------------------------------------

  sim.journeys.forEach((journey, index) => {
    const request: RequestParts | undefined = parts[index];
    if (!request) return;

    request.group.classList.add(`xss-req--${journey.kind}`);
    parkRequest(request, X_LANE, journey.from);

    // A comment carrying markup keeps its silhouette all the way down, because
    // the shape is what the scene is about. It is swapped for the verdict when
    // one lands.
    let spike: SVGElement | null = null;
    if (journey.kind === 'spiky' || journey.kind === 'exec') {
      spike = attachToRequest(request, 'polygon', { class: 'xss-spike', points: SPIKE_POINTS });
      gsap.set(spike, { opacity: 1 });
      gsap.set(request.dot, { opacity: 0 });
    }

    showRequest(tl, request, journey.showAt);
    tl.to(
      request.group,
      { y: journey.to, duration: journey.duration, ease: 'none', immediateRender: false },
      journey.showAt,
    );

    if (journey.result) {
      if (spike) tl.set(spike, { opacity: 0, immediateRender: false }, journey.landAt);
      markRequest(tl, request, journey.result, journey.landAt);
      hideRequest(tl, request, journey.landAt, MARK_FADE);
    } else {
      hideRequest(tl, request, journey.landAt, FADE);
    }
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: nobody has written anything, the
  // store is empty, the way out hands values on untouched, there are no context
  // rules and no door, the page is blank with no net over it, and nothing is in
  // flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
