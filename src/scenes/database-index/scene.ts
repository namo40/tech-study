import {
  FILLED,
  MS_WIDTH,
  READS_WIDTH,
  SCENE_DURATION,
  SLOTS,
  STAGE_STATE,
  X_INDEX_LANE,
  X_INDEX_LEFT,
  X_TABLE_LANE,
  X_TABLE_RIGHT,
  Y_POINTER,
  Y_QUERY_BOTTOM,
  Y_STORE_TOP,
  digitsOf,
  keyStateAt,
  rowStateAt,
} from './stage';
import type { Badge, Flag, KeyState, Phase, Query, RowState } from './stage';
import { q } from '../shared/dom';
import {
  hideRequest,
  markRequest,
  mountRequests,
  parkRequest,
  showRequest,
} from '../shared/request';
import type { RequestResult } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Database Index scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 * Nothing on this stage is a quantity, so nothing on it is interpolated.
 *
 * Nothing is placed by hand either. The scene is told what is stored and what is
 * asked, and one `createScheduler` pass over the whole 24 seconds derives the
 * rest:
 *
 *   1. the table, as eight rows in the order they arrived, and the index, as the
 *      same eight keys sorted, each carrying the row it points at;
 *   2. the four questions: look one key up, insert a new one, insert it again,
 *      and ask for the five hundredth page;
 *   3. what one touch costs — a row read during a scan, a key read during a
 *      descent, a key read while walking the index in order, a row fetched
 *      through a pointer, and a write;
 *   4. the pagination numbers: the page size, and how far in the page is.
 *
 * Everything the reader counts falls out of walking that. **No highlight, no
 * `reads` figure and no `ms` figure is written down anywhere in this file.** The
 * scan lights the rows it reads because the model reads them; `reads` is the
 * length of the list of cells the model has touched; `ms` is that list priced.
 * In particular the two arguments the scene makes are made by the model rather
 * than asserted: the descent stops on two keys because a binary search over
 * eight sorted keys stops on two, and the duplicate is refused because the
 * descent lands on a slot that is already occupied. Change the stored keys and
 * both change with them.
 *
 * Three compressions, all declared, none of which touches a label.
 *
 * **The spare slot.** Each column is drawn with nine slots rather than eight,
 * the ninth empty, because the second step appends a row and wedges a key in and
 * both need somewhere to land.
 *
 * **The second index.** A second index is not drawn as a second box. It is the
 * same structure billed a second time: `data-dbi-ghost` marks the repeat, the
 * same descent runs again, and `reads` and `ms` double. That is the whole claim
 * the step makes, and doubling the bill is the honest way to draw it.
 *
 * **Page five hundred.** Five thousand keys cannot be drawn, so in the fourth
 * step alone the index is a scale model: each of the eight slots stands for
 * `KEYS_PER_BLOCK` keys and the ninth stands for the page. `reads` counts keys,
 * not lit slots, and it counts them continuously, so the counter is honest at
 * every sample even though the sweep that draws it is sampled. In the first
 * three steps one slot is exactly one key or one row and `reads` is exactly the
 * number of lit slots.
 */

const ID = 'database-index';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- what the scene is told: what is stored --------------------------------

/** The rows, in the order they were written, which is no order at all. */
const TABLE_ORDER = ['mia', 'ann', 'cy', 'zoe', 'bo', 'kim', 'eve', 'raj'] as const;

/** The index: the same values, sorted. This is the only thing an index is. */
const SORTED_KEYS = [...TABLE_ORDER].sort();

/** The key the first step looks up, and the one the second step writes. */
const LOOKUP_KEY = 'raj';
const NEW_KEY = 'dan';

// --- what the scene is told: what one touch costs --------------------------

/** Reading a whole row off the table during a scan. */
const MS_ROW_SCAN = 5;
/** Stopping on one key while descending the index. */
const MS_KEY_STEP = 0.4;
/** Reading one key while walking the index in the order it is already in. */
const MS_KEY_SEQ = 0.1;
/** Following a pointer to a row whose address is already known. */
const MS_ROW_FETCH = 0.2;
/** Writing one row or one key. */
const MS_WRITE = 1;

// --- what the scene is told: page five hundred -----------------------------

/**
 * Rows a page holds, and keys the reader has already paged past. Both figures
 * are the ones the captions state — five thousand counted and thrown away,
 * twenty read — and the card's `page 500` is the label that names the query
 * rather than a third number the model derives anything from.
 */
const PAGE_SIZE = 20;
const SKIP_KEYS = 5000;
/** Slots the skipped region is drawn across, and what one of them stands for. */
const SKIP_BLOCKS = FILLED;
const KEYS_PER_BLOCK = SKIP_KEYS / SKIP_BLOCKS;
/** The slot the page itself is drawn in: the last one. */
const PAGE_SLOT = SLOTS;

// --- what the scene is told: the pace --------------------------------------

/** A lane leg: 200px at 500 px/s, and the pointer jump at the same speed. */
const LEG = 0.4;
const JUMP = 0.2;
/** How long a traveller takes to go once it is absorbed, or once it is marked. */
const FADE = 0.16;
const MARK_FADE = 0.22;

/** One row of a scan, and one stop of a descent. */
const SCAN_PACE = 0.2;
const STEP_PACE = 0.15;

/** Seconds between two sampled cues, so a walking number is not a rattle. */
const CUE_GAP = 0.55;

// --- what one pass over the scene produces ---------------------------------

interface Change {
  at: number;
  name: string;
  value: string;
}

interface CellChange {
  at: number;
  value: string;
}

type Lane = 'toTable' | 'fromTable' | 'toIndex' | 'fromIndex' | 'pointer';

interface Traveller {
  lane: Lane;
  start: number;
  land: number;
  /** The verdict it carries home, for the legs that carry one. */
  result?: RequestResult;
}

interface Simulation {
  changes: Change[];
  rows: CellChange[][];
  keys: CellChange[][];
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the derivation fails loudly. */
  marks: Record<string, { reads: number; ms: number }>;
}

// --- reading the index -----------------------------------------------------

interface Descent {
  /** The slots the search stopped on, in the order it stopped on them. */
  visited: number[];
  /** Whether the key was already there. */
  found: boolean;
  /** The slot it is in, or the slot it would have to go into. */
  at: number;
}

/**
 * A descent through a sorted run of slots. This is the whole difference between
 * the two halves of the first step: a scan has to look at everything because the
 * rows are in no order, and a descent can throw half of what is left away at
 * every stop because they are sorted.
 */
function descend(keys: readonly string[], target: string): Descent {
  const visited: number[] = [];
  let lo = 1;
  let hi = keys.length;
  while (lo <= hi) {
    const mid = Math.ceil((lo + hi) / 2);
    visited.push(mid);
    const key = keys[mid - 1] ?? '';
    if (key === target) return { visited, found: true, at: mid };
    if (key < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return { visited, found: false, at: lo };
}

/** The same descent over a run of positions, for the fourth step's scale model. */
function descendTo(count: number, target: number): number[] {
  const visited: number[] = [];
  let lo = 1;
  let hi = count;
  while (lo <= hi) {
    const mid = Math.ceil((lo + hi) / 2);
    visited.push(mid);
    if (mid === target) return visited;
    if (mid < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return visited;
}

// --- the simulation --------------------------------------------------------

/**
 * Walks the whole scene in time order.
 *
 * One `createScheduler` pass runs it: the script books the four steps, and every
 * step books the events that fall out of what it asked — one booking per row a
 * scan reads, per key a descent stops on, per sample of the sweep. Booked events
 * run earliest first, so a descent that books its own refusal lands before the
 * badge that reports it.
 */
function simulate(): Simulation {
  const { schedule, drain } = createScheduler();

  const changes: Change[] = [];
  const held: Record<string, string> = { ...STAGE_STATE };
  const write = (at: number, name: string, value: string): void => {
    if (held[name] === value) return;
    held[name] = value;
    changes.push({ at: round(at), name, value });
  };
  // `held` starts at what the markup carries, so the pass writes only what the
  // static stage does not already say.

  const rows: CellChange[][] = Array.from({ length: SLOTS }, () => []);
  const keys: CellChange[][] = Array.from({ length: SLOTS }, () => []);
  const rowHeld: RowState[] = Array.from({ length: SLOTS }, (_v, i) => rowStateAt(i));
  const keyHeld: KeyState[] = Array.from({ length: SLOTS }, (_v, i) => keyStateAt(i));
  const setRow = (at: number, slot: number, value: RowState): void => {
    const index = slot - 1;
    if (rowHeld[index] === value) return;
    rowHeld[index] = value;
    rows[index]?.push({ at: round(at), value });
  };
  const setKey = (at: number, slot: number, value: KeyState): void => {
    const index = slot - 1;
    if (keyHeld[index] === value) return;
    keyHeld[index] = value;
    keys[index]?.push({ at: round(at), value });
  };

  const travellers: Traveller[] = [];
  const send = (lane: Lane, start: number, result?: RequestResult): void => {
    const duration = lane === 'pointer' ? JUMP : LEG;
    travellers.push({ lane, start: round(start), land: round(start + duration), result });
  };

  const cueList: [number, SceneCue][] = [];
  let lastCue = -CUE_GAP;
  const anchor = (at: number, name: SceneCue): void => {
    lastCue = at;
    cueList.push([round(at), name]);
  };
  /** A cue that is only worth playing if the last one has had time to finish. */
  const sample = (at: number, name: SceneCue): void => {
    if (at - lastCue < CUE_GAP) return;
    anchor(at, name);
  };

  // --- the two numbers everything else is read off -------------------------

  /** Stored things this query has touched, and what touching them cost. */
  let reads = 0;
  let ms = 0;
  const showCost = (at: number): void => {
    digitsOf(reads, READS_WIDTH).forEach((digit, i) => write(at, `data-dbi-r${i}`, digit));
    digitsOf(ms, MS_WIDTH).forEach((digit, i) => write(at, `data-dbi-m${i}`, digit));
  };
  /** One touch: the counter and the clock move together or not at all. */
  const touch = (at: number, count: number, cost: number): void => {
    reads += count;
    ms += cost;
    showCost(at);
  };
  const spend = (at: number, cost: number): void => {
    ms += cost;
    showCost(at);
  };

  const marks: Record<string, { reads: number; ms: number }> = {};
  const mark = (name: string): void => {
    marks[name] = { reads, ms: Math.round(ms) };
  };

  /** A new question clears the answer and the bill, and nothing else. */
  const ask = (at: number, card: Query): void => {
    write(at, 'data-dbi-query', card);
    write(at, 'data-dbi-badge', 'none' satisfies Badge);
    write(at, 'data-dbi-rows', '0');
    reads = 0;
    ms = 0;
    showCost(at);
  };
  const answer = (at: number, badge: Badge, rowCount: number): void => {
    write(at, 'data-dbi-badge', badge);
    write(at, 'data-dbi-rows', String(rowCount));
  };

  /** Which slots hold anything. The spare one does not, until it is written. */
  const rowFilled = Array.from({ length: SLOTS }, (_v, i) => i < FILLED);
  const keyFilled = Array.from({ length: SLOTS }, (_v, i) => i < FILLED);

  /** The index as it stands right now. The second step changes it. */
  let indexKeys: string[] = [...SORTED_KEYS];

  /** Everything the last question lit, put back the way it was. */
  const clearCells = (at: number): void => {
    for (let slot = 1; slot <= SLOTS; slot += 1) {
      setRow(at, slot, rowFilled[slot - 1] ? 'idle' : 'empty');
      setKey(at, slot, keyFilled[slot - 1] ? 'idle' : 'empty');
    }
  };

  /**
   * A descent, run as events rather than computed into a shape. It books one
   * stop per slot the search lands on and hands the finished search to its
   * caller at the instant the last stop is made, so what happens next — a hit, a
   * wedge, a refusal — is decided by where the search actually ended up.
   */
  const runDescent = (
    from: number,
    target: string,
    onLand: (at: number, result: Descent) => void,
  ): void => {
    const result = descend(indexKeys, target);
    result.visited.forEach((slot, i) => {
      const when = round(from + i * STEP_PACE);
      schedule(when, () => {
        setKey(when, slot, 'step');
        touch(when, 1, MS_KEY_STEP);
      });
    });
    const end = round(from + result.visited.length * STEP_PACE);
    schedule(end, () => onLand(end, result));
  };

  // --- step 1: the same question against both ------------------------------

  /**
   * A scan reads every row, and it reads them because the column is in no order:
   * finding one match is no reason to stop, since there is nothing to say
   * another one is not four rows further down.
   */
  const runScan = (from: number): number => {
    let at = from;
    for (let slot = 1; slot <= TABLE_ORDER.length; slot += 1) {
      const when = round(at);
      schedule(when, () => {
        if (slot > 1) setRow(when, slot - 1, 'seen');
        setRow(when, slot, 'scan');
        touch(when, 1, MS_ROW_SCAN);
        sample(when, 'state');
      });
      at += SCAN_PACE;
    }
    return round(at);
  };

  schedule(0.5, () => send('toTable', 0.5));
  const scanEnd = runScan(1.0);
  schedule(scanEnd, () => {
    const hit = TABLE_ORDER.indexOf(LOOKUP_KEY) + 1;
    for (let slot = 1; slot <= TABLE_ORDER.length; slot += 1) {
      setRow(scanEnd, slot, slot === hit ? 'hit' : 'seen');
    }
    mark('scan');
  });
  schedule(2.8, () => {
    answer(2.8, 'found', 1);
    anchor(2.8, 'state');
    send('fromTable', 2.8, 'ok');
  });

  schedule(3.4, () => {
    ask(3.4, 'select');
    clearCells(3.4);
    send('toIndex', 3.4);
  });
  schedule(3.9, () => {
    runDescent(3.9, LOOKUP_KEY, (at, result) => {
      for (const slot of result.visited) setKey(at, slot, slot === result.at ? 'hit' : 'skip');
      // The pointer is the half of an index a sorted list does not have, so it
      // is the only part of the seek that is drawn as something travelling.
      const jumpAt = round(at + 0.1);
      schedule(jumpAt, () => {
        send('pointer', jumpAt);
        spend(jumpAt, MS_ROW_FETCH);
      });
      const landAt = round(jumpAt + JUMP);
      schedule(landAt, () => {
        setRow(landAt, TABLE_ORDER.indexOf(LOOKUP_KEY) + 1, 'hit');
        mark('seek');
      });
    });
  });
  schedule(4.8, () => {
    answer(4.8, 'found', 1);
    anchor(4.8, 'success');
    send('fromIndex', 4.8, 'ok');
  });

  // --- step 2: what the read bought, the write pays for --------------------

  schedule(6.5, () => {
    ask(6.5, 'insert');
    clearCells(6.5);
    anchor(6.5, 'trip');
    send('toTable', 6.5);
  });

  /** The append: the end of a heap of rows is the cheapest place there is. */
  const APPEND_SLOT = TABLE_ORDER.length + 1;
  schedule(7.0, () => {
    rowFilled[APPEND_SLOT - 1] = true;
    setRow(7.0, APPEND_SLOT, 'new');
    spend(7.0, MS_WRITE);
    anchor(7.0, 'state');
  });

  schedule(7.4, () => send('toIndex', 7.4));
  schedule(7.9, () => {
    runDescent(7.9, NEW_KEY, (at, result) => {
      // The key does not go at the end. It goes where it belongs, and
      // everything after it moves down a slot to make room: that is the whole
      // of what keeping an index sorted costs.
      setKey(at, result.at, 'new');
      for (let slot = result.at + 1; slot <= SLOTS; slot += 1) setKey(at, slot, 'shift');
      keyFilled[SLOTS - 1] = true;
      indexKeys = [
        ...indexKeys.slice(0, result.at - 1),
        NEW_KEY,
        ...indexKeys.slice(result.at - 1),
      ];
      spend(at, MS_WRITE);
      anchor(at, 'state');

      const settle = round(at + 0.25);
      schedule(settle, () => {
        for (let slot = 1; slot <= SLOTS; slot += 1) {
          if (slot !== result.at) setKey(settle, slot, 'idle');
        }
      });
    });
  });
  schedule(8.8, () => {
    answer(8.8, 'inserted', 1);
    mark('insert');
    anchor(8.8, 'success');
    send('fromIndex', 8.8, 'ok');
  });

  // A second index is not a second box. It is this one, doing the same work
  // again, for the same write: the bill is what doubles, so the bill is what is
  // drawn doubling.
  schedule(9.6, () => {
    write(9.6, 'data-dbi-ghost', 'on' satisfies Flag);
    anchor(9.6, 'state');
    runDescent(9.8, NEW_KEY, (at, result) => {
      setKey(at, result.at, 'new');
      spend(at, MS_WRITE);
      mark('ghost');
      anchor(at, 'state');
      const settle = round(at + 0.2);
      schedule(settle, () => {
        write(settle, 'data-dbi-ghost', 'off' satisfies Flag);
        for (let slot = 1; slot <= SLOTS; slot += 1) {
          if (slot !== result.at) setKey(settle, slot, 'idle');
        }
      });
    });
  });

  // --- step 3: the index becomes a rule ------------------------------------

  schedule(12.5, () => {
    write(12.5, 'data-dbi-unique', 'on' satisfies Flag);
    anchor(12.5, 'trip');
  });

  /** The refusal, which is one descent that ends on an occupied slot. */
  const refuse = (from: number, name: string): void => {
    runDescent(from, NEW_KEY, (landed, result) => {
      for (const slot of result.visited) {
        setKey(landed, slot, slot === result.at ? 'taken' : 'skip');
      }
      mark(name);
      anchor(landed, 'state');
    });
  };

  schedule(13.2, () => {
    ask(13.2, 'insert');
    clearCells(13.2);
    send('toIndex', 13.2);
  });
  schedule(13.7, () => refuse(13.7, 'refuse'));
  schedule(14.45, () => {
    // The table is never touched. The index answered on its own, which is why
    // the check and the claim cannot come apart.
    answer(14.45, 'duplicate', 0);
    anchor(14.45, 'failure');
    send('fromIndex', 14.45, 'fail');
  });

  // The slot has exactly one owner, so every later arrival meets the same
  // answer. Only the bill is reset between attempts; the verdict is not.
  schedule(15.4, () => {
    reads = 0;
    ms = 0;
    showCost(15.4);
    clearCells(15.4);
    send('toIndex', 15.4);
  });
  schedule(15.85, () => refuse(15.85, 'race'));
  schedule(16.4, () => send('fromIndex', 16.4, 'fail'));

  // --- step 4: two ways to reach the same page -----------------------------

  const SWEEP_FROM = 18.8;
  const SWEEP_TO = 20.4;

  schedule(18.4, () => {
    ask(18.4, 'page');
    clearCells(18.4);
    write(18.4, 'data-dbi-phase', 'offset' satisfies Phase);
    anchor(18.4, 'trip');
    send('toIndex', 18.4);
  });

  schedule(SWEEP_FROM, () => {
    // Five thousand keys are counted and thrown away. They cannot all be drawn,
    // so the sweep is sampled and the counter is not: `reads` is the model's
    // key count at every instant, and the lit slot is where in the index that
    // count has got to.
    const span = round(SWEEP_TO - SWEEP_FROM);
    let block = 0;
    for (let t = SWEEP_FROM; t <= SWEEP_TO + 1e-6; t = round(t + 0.05)) {
      const when = round(t);
      schedule(when, () => {
        const progress = Math.min(1, (when - SWEEP_FROM) / span);
        const walked = KEYS_PER_BLOCK * SKIP_BLOCKS * progress;
        reads = Math.round(walked);
        ms = walked * MS_KEY_SEQ;
        showCost(when);
        const reached = Math.min(SKIP_BLOCKS, Math.floor(progress * SKIP_BLOCKS) + 1);
        if (reached !== block) {
          if (block > 0) setKey(when, block, 'skip');
          setKey(when, reached, 'step');
          block = reached;
        }
        sample(when, 'state');
      });
    }
  });

  schedule(20.45, () => {
    setKey(20.45, SKIP_BLOCKS, 'skip');
    setKey(20.45, PAGE_SLOT, 'page');
    touch(20.45, PAGE_SIZE, PAGE_SIZE * MS_KEY_SEQ);
    send('pointer', 20.45);
    spend(20.45, PAGE_SIZE * MS_ROW_FETCH);
  });
  schedule(20.65, () => {
    for (let slot = 1; slot <= SLOTS; slot += 1) setRow(20.65, slot, 'page');
    write(20.65, 'data-dbi-rows', String(PAGE_SIZE));
    mark('offset');
  });
  schedule(20.8, () => {
    answer(20.8, 'page', PAGE_SIZE);
    anchor(20.8, 'state');
    send('fromIndex', 20.8, 'ok');
  });

  schedule(21.4, () => {
    ask(21.4, 'page');
    clearCells(21.4);
    write(21.4, 'data-dbi-phase', 'keyset' satisfies Phase);
    anchor(21.4, 'trip');
    send('toIndex', 21.6);
  });
  schedule(22.05, () => {
    // The same structure, entered at the key the reader last saw. Nothing before
    // it is counted, because nothing before it is read.
    const visited = descendTo(SLOTS, SKIP_BLOCKS);
    visited.forEach((slot, i) => {
      const when = round(22.05 + i * STEP_PACE);
      schedule(when, () => {
        setKey(when, slot, 'step');
        touch(when, 1, MS_KEY_STEP);
      });
    });
    const end = round(22.05 + visited.length * STEP_PACE);
    schedule(end, () => {
      setKey(end, PAGE_SLOT, 'page');
      touch(end, PAGE_SIZE, PAGE_SIZE * MS_KEY_SEQ);
    });
    schedule(22.4, () => {
      send('pointer', 22.4);
      spend(22.4, PAGE_SIZE * MS_ROW_FETCH);
    });
    schedule(22.6, () => {
      for (let slot = 1; slot <= SLOTS; slot += 1) setRow(22.6, slot, 'page');
      answer(22.6, 'page', PAGE_SIZE);
      mark('keyset');
      anchor(22.6, 'success');
      send('fromIndex', 22.7, 'ok');
    });
    schedule(23.2, () => {
      // The closing frame is both arithmetics on one structure: the blocks the
      // other way counted and discarded, drawn as what they were to this one —
      // never read at all.
      for (let slot = 1; slot <= SKIP_BLOCKS; slot += 1) {
        if (!visited.includes(slot)) setKey(23.2, slot, 'past');
      }
      anchor(23.2, 'state');
    });
  });
  schedule(23.5, () => {
    write(23.5, 'data-dbi-settled', 'on' satisfies Flag);
    anchor(23.5, 'success');
  });

  drain();

  // --- what the walk has to have produced ----------------------------------

  const at = (name: string): { reads: number; ms: number } => {
    const value = marks[name];
    if (!value) throw new Error(`${ID} scene: the walk never reached ${name}`);
    return value;
  };
  if (at('scan').reads !== TABLE_ORDER.length) {
    throw new Error(`${ID} scene: the scan read ${at('scan').reads} of ${TABLE_ORDER.length} rows`);
  }
  if (at('seek').reads >= at('scan').reads) {
    throw new Error(`${ID} scene: the seek read ${at('seek').reads}, the scan ${at('scan').reads}`);
  }
  if (at('ghost').reads !== 2 * at('insert').reads) {
    throw new Error(
      `${ID} scene: one index costs ${at('insert').reads} reads and two cost ${at('ghost').reads}`,
    );
  }
  if (at('refuse').reads !== at('insert').reads || at('race').reads !== at('refuse').reads) {
    throw new Error(`${ID} scene: the refusal is not the same descent as the insert`);
  }
  if (at('offset').reads !== SKIP_KEYS + PAGE_SIZE) {
    throw new Error(`${ID} scene: offset read ${at('offset').reads}, want ${SKIP_KEYS + PAGE_SIZE}`);
  }
  if (at('keyset').reads >= PAGE_SIZE + SKIP_BLOCKS) {
    throw new Error(`${ID} scene: keyset read ${at('keyset').reads}, which is not a seek`);
  }
  if (keyHeld[SLOTS - 1] === 'empty' || rowHeld[SLOTS - 1] === 'empty') {
    throw new Error(`${ID} scene: the spare slots were never written`);
  }
  if (held['data-dbi-badge'] !== 'page' || held['data-dbi-rows'] !== String(PAGE_SIZE)) {
    throw new Error(`${ID} scene: it settled on ${held['data-dbi-badge']}`);
  }
  // A cue on a step boundary belongs to neither step, and two cues on top of
  // each other are one noise. Both are checked here rather than trusted.
  cueList.sort((left, right) => left[0] - right[0]);
  for (let i = 0; i < cueList.length; i += 1) {
    const when = cueList[i]?.[0] ?? 0;
    if (BOUNDARIES.some((edge) => Math.abs(when - edge) < 0.3)) {
      throw new Error(`${ID} scene: a cue at ${when} sits on a step boundary`);
    }
    const previous = cueList[i - 1]?.[0];
    if (previous !== undefined && when - previous < 0.2 - 1e-6) {
      throw new Error(`${ID} scene: cues at ${previous} and ${when} are on top of each other`);
    }
  }
  for (const plan of travellers) {
    if (plan.land > SCENE_DURATION || plan.start < 0) {
      throw new Error(`${ID} scene: a traveller runs off the end of the scene`);
    }
  }

  // --- the changes, collapsed at each instant ------------------------------

  // Two changes to one attribute at one instant would render in insertion order
  // forwards and in reverse backwards, so that single frame would depend on
  // which way the reader scrubbed. Only the one that ends up applying is kept.
  const collapse = <T extends { at: number }>(series: T[], keyOf: (item: T) => string): T[] => {
    const ordered: T[] = [];
    for (const entry of series) {
      let replaced = false;
      for (let i = ordered.length - 1; i >= 0; i -= 1) {
        const candidate = ordered[i];
        if (!candidate || candidate.at !== entry.at) break;
        if (keyOf(candidate) === keyOf(entry)) {
          ordered[i] = entry;
          replaced = true;
          break;
        }
      }
      if (!replaced) ordered.push(entry);
    }
    return ordered;
  };

  travellers.sort((left, right) => left.start - right.start);
  cueList.sort((left, right) => left[0] - right[0]);

  return {
    changes: collapse(changes, (entry) => entry.name),
    rows: rows.map((series) => collapse(series, () => 'row')),
    keys: keys.map((series) => collapse(series, () => 'key')),
    travellers,
    cues: cueList,
    marks,
  };
}

// --- the timeline ----------------------------------------------------------

/** Where a traveller starts, and the one coordinate its lane moves. */
const LANES: Record<Lane, { x: number; y: number; to: gsap.TweenVars }> = {
  toTable: { x: X_TABLE_LANE, y: Y_QUERY_BOTTOM, to: { y: Y_STORE_TOP } },
  fromTable: { x: X_TABLE_LANE, y: Y_STORE_TOP, to: { y: Y_QUERY_BOTTOM } },
  toIndex: { x: X_INDEX_LANE, y: Y_QUERY_BOTTOM, to: { y: Y_STORE_TOP } },
  fromIndex: { x: X_INDEX_LANE, y: Y_STORE_TOP, to: { y: Y_QUERY_BOTTOM } },
  pointer: { x: X_INDEX_LEFT, y: Y_POINTER, to: { x: X_TABLE_RIGHT } },
};

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const rowElements = Array.from({ length: SLOTS }, (_value, index) =>
    q<SVGRectElement>(stage, `.dbi-row--${index + 1}`, ID),
  );
  const keyElements = Array.from({ length: SLOTS }, (_value, index) =>
    q<SVGRectElement>(stage, `.dbi-key--${index + 1}`, ID),
  );

  const sim = simulate();

  // The captions name the figures the model produced. Nothing here places them:
  // if the stored rows or the costs are changed, this is what says the captions
  // have stopped describing the scene.
  const scan = sim.marks['scan'];
  const seek = sim.marks['seek'];
  const offset = sim.marks['offset'];
  const keyset = sim.marks['keyset'];
  if (!scan || !seek || !offset || !keyset) throw new Error(`${ID} scene: the walk fell short`);
  if (scan.reads !== 8 || seek.reads !== 2) {
    throw new Error(
      `${ID} scene: the caption says eight rows and two steps, the model says ` +
        `${scan.reads} and ${seek.reads}`,
    );
  }
  if (offset.reads !== 5020 || keyset.reads > 24) {
    throw new Error(`${ID} scene: page 500 cost ${offset.reads} and ${keyset.reads}`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const change of sim.changes) attr(tl, stage, change.name, change.value, change.at);
  sim.rows.forEach((series, index) => {
    const element = rowElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-dbi-row', entry.value, entry.at);
  });
  sim.keys.forEach((series, index) => {
    const element = keyElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-dbi-key', entry.value, entry.at);
  });

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    parkRequest(request, lane.x, lane.y);
    showRequest(tl, request, plan.start);
    tl.to(
      request.group,
      {
        ...lane.to,
        duration: round(plan.land - plan.start),
        ease: 'none',
        immediateRender: false,
      },
      plan.start,
    );

    // Only the legs that come home carry a verdict. A query on its way down and
    // a pointer on its way across are absorbed by whatever they reached.
    if (plan.result) {
      markRequest(tl, request, plan.result, plan.land);
      hideRequest(tl, request, plan.land, MARK_FADE);
    } else {
      hideRequest(tl, request, plan.land, FADE);
    }
  });

  // --- sound ---------------------------------------------------------------

  for (const [when, name] of sim.cues) tl.call(() => cue(name), undefined, when);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: eight rows stored in the order
  // they arrived, the same eight keys sorted, one spare slot in each column, a
  // question on the card, both readouts at zero and nothing in the air.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
