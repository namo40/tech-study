import {
  KEY_COUNT,
  LANE_X,
  MOVED_MAX,
  SCENE_DURATION,
  SHARD_CELLS,
  X_S2,
  Y_ROUTER_BOTTOM,
  Y_SHARD_TOP,
} from './stage';
import type { CellState, Cost, Level, Mark, Mode, Rule, Strain, TouchState } from './stage';
import { q } from '../shared/dom';
import { hideRequest, markRequest, mountRequests, parkRequest, showRequest } from '../shared/request';
import { createScheduler } from '../shared/simulation';
import { attr, round } from '../shared/state';
import { createSceneTimeline, defineScene, finishSceneTimeline } from '../shared/timeline';
import type { SceneBuildOptions, SceneCue, SceneInstance, SceneStep } from '../types';

/**
 * Sharding scene: a 24 second, four step timeline.
 *
 * The two standing rules apply here as everywhere: every tween sits at an
 * absolute position, and every discrete change is a zero-duration tween on a
 * `data-*` attribute that GSAP reverts when the playhead moves back past it.
 *
 * Nothing the reader counts is authored. The scene is told six things — twelve
 * keys, each with a hash and a position on the ring; when the Router first
 * routes each of them; the two placement rules, `hash mod n` and a ring of
 * tokens; when S2 joins; which key each query asks for and when; and the order
 * the ring's movers leave in. One pass over the whole 24 seconds turns that
 * into everything else: which cell every key lands in, `keys n`, every `load`
 * gauge, which cells the `mod 3` ghost marks, `moved n` in both branches, which
 * shards each query touches, and when the picture settles.
 *
 * Three derivations carry the argument. **Where a key lives is the rule, not a
 * placement.** A key's shard is computed from its hash or its ring position
 * every time it is asked for, including when a query asks; the build asserts
 * that the same key answers with the same shard for as long as the rule holds,
 * so "same key, same shard" is a property of the routing rather than a promise
 * drawn on top of it. **The two costs of growth are counted, not stated.**
 * `moved 8` is the number of keys whose `hash mod 3` answer differs from their
 * `hash mod 2` answer, and `moved 4` is the number the ring hands to S2 when
 * its two tokens are added; both are counted from the same twelve keys, and the
 * build fails if either count drifts. **The balance at the end is arithmetic.**
 * 4/4/4 is what is left after the ring moves what it moves, so the closing
 * frame is not a tidy picture the scene arranged: it is the consequence of the
 * token placement above it.
 *
 * The build also asserts the premise the third step rests on: the ring with two
 * tokens puts every key exactly where `mod 2` had already put it, so switching
 * the Router from `mod 2` to `ring` moves nothing at all, and every key that
 * moves afterwards moves because S2 arrived. Without that, `moved 4` would be
 * measuring two changes at once.
 *
 * One thing is a picture rather than a measurement. No cell carries a number.
 * Which key is which is which box it sits in, because ownership *is* what this
 * scene is about, and writing the key's name a second time is what would let
 * the two copies disagree. A cell a key has left is drawn differently from a
 * cell no key ever reached, because the difference between those two is the
 * whole cost of a rebalance.
 */

const ID = 'sharding';

const STEPS: SceneStep[] = [
  { id: 'step-1', label: 'step-1', time: 0 },
  { id: 'step-2', label: 'step-2', time: 6 },
  { id: 'step-3', label: 'step-3', time: 12 },
  { id: 'step-4', label: 'step-4', time: 18 },
];

const BOUNDARIES = [0, 6, 12, 18, 24];

// --- how a traveller moves -------------------------------------------------

/** One lane: 200px between the Router's bottom edge and a shard's top edge. */
const LEG = 0.26;

/** How long a traveller takes to fade, and how long a result marker holds. */
const FADE_IN_LEG = 0.1;
const MARK_HOLD = 0.22;
const MARK_FADE = 0.14;

// --- what the scene is told ------------------------------------------------

/** The three shards, which are also the three lane columns. */
type Shard = 0 | 1 | 2;

interface KeyPlan {
  /** The name the derivation uses. Never drawn: a cell is a place, not a word. */
  id: string;
  /** What `hash mod n` is computed from. */
  hash: number;
  /** Where the key falls on the ring, which is a different hash of the key. */
  ring: number;
  /** When the Router first routes it, in the first step. */
  at: number;
}

/**
 * The twelve keys, in the order the Router routes them. The hashes are the only
 * thing that decides the first two answers: `hash mod 2` is where each key goes
 * in the first step, and `hash mod 3` is the answer the third step prices. The
 * ring positions are the second hash a consistent-hashing router keeps, and
 * they are chosen so the two-token ring agrees with `mod 2` everywhere — which
 * is asserted below rather than assumed, because it is the premise that makes
 * `moved 4` a measurement of adding a shard and of nothing else.
 */
const KEYS: KeyPlan[] = [
  { id: 'k2', hash: 2360, ring: 2, at: 1.8 },
  { id: 'k1', hash: 4817, ring: 6, at: 2.03 },
  { id: 'k4', hash: 6142, ring: 0, at: 2.26 },
  { id: 'k3', hash: 9073, ring: 8, at: 2.49 },
  { id: 'k6', hash: 7300, ring: 3, at: 2.72 },
  { id: 'k5', hash: 1509, ring: 9, at: 2.95 },
  { id: 'k8', hash: 5586, ring: 4, at: 3.18 },
  { id: 'k7', hash: 3923, ring: 7, at: 3.41 },
  { id: 'k10', hash: 1070, ring: 1, at: 3.64 },
  { id: 'k9', hash: 8235, ring: 10, at: 3.87 },
  { id: 'k11', hash: 6648, ring: 5, at: 4.1 },
  { id: 'k12', hash: 2587, ring: 11, at: 4.33 },
];

/** How far round the ring goes before it comes back to the same place. */
const RING_SIZE = 12;

interface Token {
  at: number;
  shard: Shard;
}

/** The ring the Router holds while there are two shards. */
const TOKENS_TWO: Token[] = [
  { at: 5, shard: 0 },
  { at: 11, shard: 1 },
];

/** The same ring once S2 has been given its two tokens, and nothing else changed. */
const TOKENS_THREE: Token[] = [
  { at: 1, shard: 2 },
  { at: 5, shard: 0 },
  { at: 7, shard: 2 },
  { at: 11, shard: 1 },
];

/** `hash mod n`: the answer that changes for most keys when n changes. */
const modOwner = (key: KeyPlan, shards: number): Shard => (key.hash % shards) as Shard;

/**
 * The ring: a key belongs to the first token at or after its own position,
 * wrapping past the end. Adding a shard adds tokens and moves only the keys
 * that now find a nearer one, which is the whole of consistent hashing.
 */
const ringOwner = (key: KeyPlan, tokens: Token[]): Shard => {
  const position = ((key.ring % RING_SIZE) + RING_SIZE) % RING_SIZE;
  const sorted = [...tokens].sort((left, right) => left.at - right.at);
  const found = sorted.find((token) => token.at >= position);
  return (found ?? sorted[0] ?? { shard: 0 as Shard }).shard;
};

// --- when things happen ----------------------------------------------------

/** The first step: the one box fills up, and then there is somewhere to split to. */
const STRAIN_FULL_AT = 0.5;
const STRAIN_OVER_AT = 0.9;
const SHARD_AT = 1.4;

/** A query, which is a key the Router is asked for, or a query that has no key. */
interface QueryPlan {
  at: number;
  /** The key asked for, or `null` for a query that ignores the shard key. */
  key: string | null;
}

/**
 * Every lookup the scene makes. The three in a row on one key are the promise
 * being demonstrated; the one with no key is what ignoring it costs; the four
 * in the last step are ordinary traffic against three shards. None of them says
 * which shard to visit: the active rule decides, the same way it decided where
 * the key was written.
 */
const QUERIES: QueryPlan[] = [
  { at: 6.5, key: 'k8' },
  { at: 7.2, key: 'k8' },
  { at: 7.9, key: 'k8' },
  { at: 9.6, key: null },
  { at: 10.1, key: 'k5' },
  { at: 18.5, key: 'k11' },
  { at: 19.1, key: 'k7' },
  { at: 19.7, key: 'k5' },
  { at: 20.3, key: 'k4' },
];

/** The third step: S2 joins, the `mod 3` answer is priced, then the ring's is. */
const S2_JOINS_AT = 12.4;
const GHOST_AT = 13.0;
const GHOST_COUNT_AT = 13.6;
const RING_AT = 14.2;

/** When each key the ring hands to S2 leaves, in the order they leave. */
const REBALANCE_FROM = 14.7;
const REBALANCE_PITCH = 0.45;
/** How long a key handed over sits in the Router, which is longer than the
    leg it arrived on takes to fade, so it is never drawn in two places. */
const HANDOVER_DWELL = 0.12;

/** When the scene holds something up, and for how long. */
const MARKS: [number, number, Mark, SceneCue][] = [
  [5.0, 0.7, 'keys', 'state'],
  [8.8, 0.7, 'promise', 'state'],
  [10.7, 0.8, 'choose', 'state'],
  [17.0, 0.8, 'compare', 'state'],
  [20.9, 0.5, 'balance', 'state'],
  [21.5, 0.6, 'next', 'state'],
  [22.2, 0.5, 'balance', 'success'],
];

/** When the picture calls itself settled, once nothing is left to move. */
const SETTLE_AT = 22.9;

/** Where a shard's load stops being one word and starts being another. */
const LIGHT_AT = 1;
const EVEN_AT = 3;
const HEAVY_AT = 5;

const levelFor = (count: number): Level =>
  count >= HEAVY_AT ? 'heavy' : count >= EVEN_AT ? 'even' : count >= LIGHT_AT ? 'light' : 'idle';

/** How close two samples of one repeating thing may sound, how close any cue
    may fall to another, and how close any of it may fall to a boundary. */
const SAMPLE_GAP: Record<string, number> = { route: 0.62, probe: 0.5, move: 0.4 };
const MIN_CUE_GAP = 0.2;
const BOUNDARY_GAP = 0.3;

/** Times are rounded to milliseconds, so a gap of exactly the minimum is one. */
const EPS = 1e-6;

// --- what one pass over the scene produces ---------------------------------

/**
 * The five declared segments. Three columns carry keys and queries down from
 * the Router; the two that a key can leave carry it back up. S2 never loses a
 * key, so it never has an upward leg.
 */
type Lane = 'down-0' | 'down-1' | 'down-2' | 'up-0' | 'up-1';

interface Traveller {
  lane: Lane;
  start: number;
  land: number;
  /** How it is drawn: a key being placed, a lookup, or a key being handed over. */
  kind: 'route' | 'query' | 'lift' | 'land';
  /** The marker it pops when it lands, or nothing for a leg that is not a result. */
  result: 'ok' | null;
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
  loads: Series[][];
  cells: Series[][][];
  touches: Series[][];
  travellers: Traveller[];
  cues: [number, SceneCue][];
  /** Read back by the build, so a drift in the derivation fails loudly. */
  ghostMovers: number;
  ringMovers: number;
  finalCounts: number[];
}

// --- the simulation --------------------------------------------------------

/** A key that is sitting in a shard, and the cell it is sitting in. */
interface Placed {
  key: KeyPlan;
  shard: Shard;
  cell: number;
}

/**
 * Walks the whole scene in time order.
 *
 * The routings are booked first, because everything downstream needs a key to
 * be somewhere: a query can only be answered by the shard its key is in, the
 * `mod 3` ghost can only mark keys that have been placed, and the ring can only
 * hand over what a shard is holding. Booked events run earliest first and a
 * running one may book more, so the rebalance sees exactly the placement the
 * first step produced and nothing that comes later.
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

  /** Puts one traveller on a segment and answers when it gets to the far end. */
  const travel = (
    lane: Lane,
    start: number,
    kind: Traveller['kind'],
    result: 'ok' | null,
  ): number => {
    const land = round(start + LEG);
    travellers.push({ lane, start: round(start), land, kind, result });
    return land;
  };

  // --- what the diagram is holding ----------------------------------------

  const byId = new Map(KEYS.map((key) => [key.id, key]));
  const placed = new Map<string, Placed>();
  const rows: Placed[][] = [[], [], []];
  const counts: number[] = [0, 0, 0];
  const levels: Level[] = ['idle', 'idle', 'idle'];
  const touched: TouchState[] = ['off', 'off', 'off'];

  let rule: Rule = 'off';
  let keysPlaced = 0;
  let s2 = false;
  let moved = 0;
  let cost: Cost = 'one';
  let ghostMovers = 0;
  let ringMovers = 0;

  const { schedule, drain } = createScheduler();

  // --- the opening state, which is the whole diagram -----------------------

  record('mode', 0, 'single' satisfies Mode);
  record('strain', 0, 'calm' satisfies Strain);
  record('rule', 0, 'off' satisfies Rule);
  record('keys', 0, '0');
  record('s2', 0, 'off');
  record('cost', 0, 'one' satisfies Cost);
  record('moved', 0, '0');
  record('mark', 0, 'none' satisfies Mark);
  record('settled', 0, 'off');
  for (let s = 0; s < 3; s += 1) {
    record(`load-${s}`, 0, 'idle' satisfies Level);
    record(`touch-${s + 1}`, 0, 'off' satisfies TouchState);
    for (let n = 1; n <= SHARD_CELLS; n += 1) {
      record(`cell-${s}-${n}`, 0, 'none' satisfies CellState);
    }
  }

  /**
   * A shard's gauge, recomputed wherever its row can have changed. It reads the
   * cells and nothing else, so there is no way for it to disagree with the row
   * above it — and the balance at the end is three gauges agreeing by
   * arithmetic rather than by arrangement.
   */
  const readLoad = (shard: Shard, at: number): void => {
    const level = levelFor(counts[shard] ?? 0);
    if (level === levels[shard]) return;
    levels[shard] = level;
    record(`load-${shard}`, at, level);
  };

  /** Which shards the last thing the Router did had to open. */
  const setTouch = (at: number, shards: Shard[]): void => {
    for (const s of [0, 1, 2] as Shard[]) {
      const now: TouchState = shards.includes(s) ? 'on' : 'off';
      if (now === touched[s]) continue;
      touched[s] = now;
      record(`touch-${s + 1}`, at, now);
    }
  };

  const setCost = (at: number, value: Cost): void => {
    if (value === cost) return;
    cost = value;
    record('cost', at, value);
  };

  /** Where the Router says a key lives, under whatever rule it is holding. */
  const ownerNow = (key: KeyPlan): Shard =>
    rule === 'ring' ? ringOwner(key, s2 ? TOKENS_THREE : TOKENS_TWO) : modOwner(key, 2);

  /** Puts a key in a shard's next free cell. */
  const put = (key: KeyPlan, shard: Shard, at: number): void => {
    const row = rows[shard];
    if (!row) return;
    const cell = row.length + 1;
    if (cell > SHARD_CELLS) {
      problems.push(`${key.id} outgrew the row S${shard} draws`);
      return;
    }
    row.push({ key, shard, cell });
    placed.set(key.id, { key, shard, cell });
    counts[shard] = (counts[shard] ?? 0) + 1;
    record(`cell-${shard}-${cell}`, at, 'here' satisfies CellState);
    readLoad(shard, at);
  };

  /** Takes a key out of the shard it is in, leaving the cell it was in behind. */
  const take = (key: KeyPlan, at: number): Shard | null => {
    const home = placed.get(key.id);
    if (!home) {
      problems.push(`${key.id} was asked to move but is nowhere`);
      return null;
    }
    placed.delete(key.id);
    counts[home.shard] = (counts[home.shard] ?? 0) - 1;
    record(`cell-${home.shard}-${home.cell}`, at, 'gone' satisfies CellState);
    readLoad(home.shard, at);
    return home.shard;
  };

  // --- the first step: one box, then a rule --------------------------------

  schedule(STRAIN_FULL_AT, () => {
    record('strain', STRAIN_FULL_AT, 'full' satisfies Strain);
    fix(STRAIN_FULL_AT, 'state');
  });
  schedule(STRAIN_OVER_AT, () => {
    record('strain', STRAIN_OVER_AT, 'over' satisfies Strain);
    fix(STRAIN_OVER_AT, 'failure');
  });
  schedule(SHARD_AT, () => {
    rule = 'mod2';
    record('mode', SHARD_AT, 'sharded' satisfies Mode);
    record('strain', SHARD_AT, 'calm' satisfies Strain);
    record('rule', SHARD_AT, 'mod2' satisfies Rule);
    fix(SHARD_AT, 'trip');
  });

  for (const key of KEYS) {
    schedule(key.at, () => {
      // The lane is the shard, and the shard is the rule applied to the hash.
      // Nothing about the routing is authored except the moment it happens.
      const shard = ownerNow(key);
      setCost(key.at, 'one');
      setTouch(key.at, [shard]);
      const land = travel(`down-${shard}` as Lane, key.at, 'route', null);
      schedule(land, () => {
        put(key, shard, land);
        keysPlaced += 1;
        record('keys', land, String(keysPlaced));
        sample(land, 'route', 'success');
      });
    });
  }

  // --- the queries, answered by whatever rule is in force ------------------

  for (const query of QUERIES) {
    schedule(query.at, () => {
      const live: Shard[] = s2 ? [0, 1, 2] : [0, 1];
      if (query.key === null) {
        // A query with no shard key cannot be routed, so it is asked of every
        // shard there is. What it costs is how many that happens to be.
        setCost(query.at, 'fan');
        setTouch(query.at, live);
        for (const shard of live) travel(`down-${shard}` as Lane, query.at, 'query', 'ok');
        fix(query.at, 'state');
        return;
      }
      const key = byId.get(query.key);
      if (!key) {
        problems.push(`query at ${query.at} asked for ${query.key}, which is not a key`);
        return;
      }
      const shard = ownerNow(key);
      const home = placed.get(key.id);
      // The promise, checked rather than drawn: the shard the rule computes is
      // the shard the key is actually sitting in.
      if (!home || home.shard !== shard) {
        problems.push(
          `${key.id} routes to S${shard} at ${query.at} but sits in ${home ? `S${home.shard}` : 'no shard'}`,
        );
      }
      setCost(query.at, 'one');
      setTouch(query.at, [shard]);
      const land = travel(`down-${shard}` as Lane, query.at, 'query', 'ok');
      schedule(land, () => sample(land, 'probe', 'success'));
    });
  }

  // --- the third step: what a third shard costs ----------------------------

  schedule(S2_JOINS_AT, () => {
    s2 = true;
    record('s2', S2_JOINS_AT, 'on');
    fix(S2_JOINS_AT, 'trip');
  });

  // The ghost is `hash mod 3` asked of every key that is already placed. It is
  // never applied: what is drawn is the set of keys whose answer changed, and
  // the size of that set is the price.
  schedule(GHOST_AT, () => {
    record('rule', GHOST_AT, 'mod3' satisfies Rule);
    for (const home of placed.values()) {
      if (modOwner(home.key, 3) === home.shard) continue;
      ghostMovers += 1;
      record(`cell-${home.shard}-${home.cell}`, GHOST_AT, 'move' satisfies CellState);
    }
    fix(GHOST_AT, 'state');
  });

  schedule(GHOST_COUNT_AT, () => {
    moved = ghostMovers;
    record('moved', GHOST_COUNT_AT, String(moved));
    fix(GHOST_COUNT_AT, 'failure');
  });

  schedule(RING_AT, () => {
    rule = 'ring';
    record('rule', RING_AT, 'ring' satisfies Rule);
    // The ghost was a question, so putting it away puts its price away too.
    for (const home of placed.values()) {
      if (modOwner(home.key, 3) === home.shard) continue;
      record(`cell-${home.shard}-${home.cell}`, RING_AT, 'here' satisfies CellState);
    }
    moved = 0;
    record('moved', RING_AT, '0');
    fix(RING_AT, 'trip');

    // Who moves is the ring's answer, not a list: every key still sitting
    // somewhere the ring no longer sends it. They leave shard by shard in turn,
    // oldest cell first, so no two are ever on one column at once.
    const leaving = [...placed.values()].filter((home) => ringOwner(home.key, TOKENS_THREE) !== home.shard);
    ringMovers = leaving.length;
    const queues: Placed[][] = [0, 1, 2].map((shard) =>
      leaving.filter((home) => home.shard === shard).sort((left, right) => left.cell - right.cell),
    );
    const leavingOrder: Placed[] = [];
    for (let turn = 0; turn < SHARD_CELLS; turn += 1) {
      for (const queue of queues) {
        const next = queue[turn];
        if (next) leavingOrder.push(next);
      }
    }

    leavingOrder.forEach((home, index) => {
      const leaves = round(REBALANCE_FROM + index * REBALANCE_PITCH);
      const target = ringOwner(home.key, TOKENS_THREE);
      schedule(leaves, () => {
        const from = take(home.key, leaves);
        if (from === null || from === 2) return;
        // Two legs on the columns that already exist: up to the Router, which
        // is the only thing that knows both maps, and down into the new shard.
        const atRouter = travel(`up-${from}` as Lane, leaves, 'lift', null);
        const leaves2 = round(atRouter + HANDOVER_DWELL);
        schedule(leaves2, () => {
          const land = travel('down-2', leaves2, 'land', 'ok');
          schedule(land, () => {
            put(home.key, target, land);
            moved += 1;
            record('moved', land, String(moved));
            sample(land, 'move', 'success');
          });
        });
      });
    });
  });

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

  if (keysPlaced !== KEY_COUNT) {
    throw new Error(`${ID} scene: ${keysPlaced} of ${KEY_COUNT} keys were routed`);
  }
  if (placed.size !== KEY_COUNT) {
    throw new Error(`${ID} scene: ${placed.size} keys are in a shard, ${KEY_COUNT} were routed`);
  }
  if (ghostMovers !== 8) {
    throw new Error(`${ID} scene: hash mod 3 moves ${ghostMovers} keys, the scene is about 8`);
  }
  if (ringMovers !== 4) {
    throw new Error(`${ID} scene: the ring moves ${ringMovers} keys, the scene is about 4`);
  }
  if (moved !== ringMovers) {
    throw new Error(`${ID} scene: moved reads ${moved} after ${ringMovers} keys moved`);
  }

  // The premise the whole third step rests on: with two shards the ring says
  // exactly what `mod 2` said, so switching the Router to it moves nothing and
  // `moved 4` is the price of S2 alone.
  for (const key of KEYS) {
    if (ringOwner(key, TOKENS_TWO) !== modOwner(key, 2)) {
      problems.push(`${key.id} sits in S${modOwner(key, 2)} under mod 2 but S${ringOwner(key, TOKENS_TWO)} on the ring`);
    }
  }
  // Every key the ring moves goes to the new shard. A key never changes hands
  // between the two shards that were already there.
  for (const key of KEYS) {
    const before = ringOwner(key, TOKENS_TWO);
    const after = ringOwner(key, TOKENS_THREE);
    if (before !== after && after !== 2) {
      problems.push(`${key.id} moved from S${before} to S${after}, which is not the new shard`);
    }
  }
  if (counts.some((count) => count !== KEY_COUNT / 3)) {
    problems.push(`the shards ended on ${counts.join('/')} rather than an even split`);
  }
  if (counts.reduce((sum, count) => sum + count, 0) !== KEY_COUNT) {
    problems.push(`${counts.reduce((sum, count) => sum + count, 0)} keys are held, ${KEY_COUNT} exist`);
  }
  if (ringMovers > ghostMovers) {
    problems.push(`the ring moved ${ringMovers} keys and mod 3 moved ${ghostMovers}`);
  }
  if (ghostMovers > MOVED_MAX) {
    problems.push(`moved reached ${ghostMovers}, which the stage cannot draw`);
  }

  if (problems.length > 0) throw new Error(`${ID} scene: ${problems.join('; ')}`);

  // --- the series, put in time order and collapsed -------------------------

  // Changes are recorded as they are worked out rather than as they happen — a
  // landing writes a cell, a gauge and a counter in one pass — so each key is
  // sorted once here. Two changes to one key at one instant would otherwise
  // render in insertion order forwards and in reverse backwards, so only the
  // one that ends up applying is kept.
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
  for (const key of ['mode', 'strain', 'rule', 'keys', 's2', 'cost', 'moved', 'mark', 'settled']) {
    flags[key] = seriesOf(key);
  }
  const loads = [0, 1, 2].map((shard) => seriesOf(`load-${shard}`));
  const cells = [0, 1, 2].map((shard) =>
    Array.from({ length: SHARD_CELLS }, (_value, index) => seriesOf(`cell-${shard}-${index + 1}`)),
  );
  const touches = [1, 2, 3].map((index) => seriesOf(`touch-${index}`));

  // --- the cues ------------------------------------------------------------

  // Same shape as the other scenes: everything the scene has to say is kept,
  // and the repeating families are thinned to samples so a landing is heard
  // often enough to read as a rhythm without becoming one.
  const accepted: Fixed[] = fixed
    .filter((entry) => !BOUNDARIES.some((edge) => Math.abs(entry.at - edge) < BOUNDARY_GAP - EPS))
    .sort((left, right) => left.at - right.at)
    .filter(
      (entry, index, list) =>
        index === 0 || entry.at - (list[index - 1]?.at ?? -99) >= MIN_CUE_GAP - EPS,
    );

  const lastOf: Record<string, number> = { route: -99, probe: -99, move: -99 };
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
    loads,
    cells,
    touches,
    travellers,
    cues,
    ghostMovers,
    ringMovers,
    finalCounts: [...counts],
  };
}

// --- the timeline ----------------------------------------------------------

/** Where a traveller starts, and the one coordinate its segment moves. */
const LANES: Record<Lane, { x: number; y: number; to: number }> = {
  'down-0': { x: LANE_X[0], y: Y_ROUTER_BOTTOM, to: Y_SHARD_TOP },
  'down-1': { x: LANE_X[1], y: Y_ROUTER_BOTTOM, to: Y_SHARD_TOP },
  'down-2': { x: X_S2, y: Y_ROUTER_BOTTOM, to: Y_SHARD_TOP },
  'up-0': { x: LANE_X[0], y: Y_SHARD_TOP, to: Y_ROUTER_BOTTOM },
  'up-1': { x: LANE_X[1], y: Y_SHARD_TOP, to: Y_ROUTER_BOTTOM },
};

function build(stage: SVGSVGElement, options: SceneBuildOptions): SceneInstance {
  const { cue } = options;

  const layer = q<SVGGElement>(stage, '.scene-requests', ID);
  const shardElements = [0, 1, 2].map((index) =>
    q<SVGGElement>(stage, `.sh-shard--${index}`, ID),
  );
  const cellElements = [0, 1, 2].map((shard) =>
    Array.from({ length: SHARD_CELLS }, (_value, index) =>
      q<SVGRectElement>(stage, `.sh-shard--${shard} .sh-cell--${index + 1}`, ID),
    ),
  );
  const touchElements = [1, 2, 3].map((index) =>
    q<SVGRectElement>(stage, `.sh-touch--${index}`, ID),
  );

  const sim = simulate();
  if (sim.finalCounts.some((count) => count !== KEY_COUNT / 3)) {
    throw new Error(`${ID} scene: the shards ended on ${sim.finalCounts.join('/')}`);
  }

  const parts = mountRequests(layer, sim.travellers.length, ID);
  const tl = createSceneTimeline();

  // --- everything the stage says about itself ------------------------------

  for (const [name, series] of Object.entries(sim.flags)) {
    for (const entry of series) attr(tl, stage, `data-sh-${name}`, entry.value, entry.at);
  }
  sim.loads.forEach((series, index) => {
    const element = shardElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-sh-load', entry.value, entry.at);
  });
  sim.cells.forEach((row, shard) => {
    row.forEach((series, index) => {
      const element = cellElements[shard]?.[index];
      if (!element) return;
      for (const entry of series) attr(tl, element, 'data-sh-cell', entry.value, entry.at);
    });
  });
  sim.touches.forEach((series, index) => {
    const element = touchElements[index];
    if (!element) return;
    for (const entry of series) attr(tl, element, 'data-sh-touch', entry.value, entry.at);
  });

  // --- what travels --------------------------------------------------------

  sim.travellers.forEach((plan, index) => {
    const request = parts[index];
    if (!request) return;
    const lane = LANES[plan.lane];

    // A lookup is drawn differently from a key, because one of them changes
    // where the data is and the other only asks.
    if (plan.kind === 'query') request.group.classList.add('sh-query');
    if (plan.kind === 'lift' || plan.kind === 'land') request.group.classList.add('sh-mover');

    parkRequest(request, lane.x, lane.y);
    showRequest(tl, request, plan.start);
    tl.to(
      request.group,
      { y: lane.to, duration: LEG, ease: 'none', immediateRender: false },
      plan.start,
    );

    if (plan.result === null) {
      // Placing a key and handing one over are not results, so neither pops a
      // marker: the answer is the row it lands in.
      hideRequest(tl, request, plan.land, FADE_IN_LEG);
      return;
    }
    markRequest(tl, request, plan.result, plan.land);
    hideRequest(tl, request, round(plan.land + MARK_HOLD), MARK_FADE);
  });

  // --- sound ---------------------------------------------------------------

  for (const [at, name] of sim.cues) tl.call(() => cue(name), undefined, at);

  // --- step labels ---------------------------------------------------------

  // The stage is complete on the first frame: one box with every key in it, a
  // Router with no rule to apply yet, a lookup that costs one box because there
  // is only one, nothing moved, and nothing in flight.
  tl.addLabel('step-1', 0);
  tl.addLabel('step-2', 6);
  tl.addLabel('step-3', 12);
  tl.addLabel('step-4', 18);

  finishSceneTimeline(tl, SCENE_DURATION);

  return { tl, steps: STEPS };
}

export default defineScene({ id: ID, duration: SCENE_DURATION, build });
