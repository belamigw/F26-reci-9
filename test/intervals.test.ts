import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Read the spec in src/intervals/mergeIntervals.ts, then check your progress
// with `npm run mutants:intervals`.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The output is sorted.
// (invariant, algebraic, metamorphic, differential, or conditional)

// A first attempt at a generator. It has a problem: run the tests and read
// the counterexample.
const interval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -100, max: 100 }), fc.nat({ max: 20 }))
  .map(([start, len]): Interval => [start, start + len]);
const intervalList = fc.array(interval);


// A list together with a shuffled copy of it.
const listAndShuffle = intervalList.chain(xs =>
  fc.tuple(fc.constant(xs), fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length })),
);

// Targeted generator for the conditional property: intervals that already
// neither overlap nor touch, built left to right. Each one starts at least 1
// after the previous one ends (gap >= 1), so prev.end < next.start.
// A gap of exactly 1 is the tricky case: [1,2] and [3,4] must stay separate.
const disjointSorted: fc.Arbitrary<Interval[]> = fc
  .tuple(
    fc.integer({ min: -100, max: 100 }),
    fc.array(fc.tuple(fc.integer({ min: 1, max: 3 }), fc.nat({ max: 5 }))),
  )
  .map(([first, steps]) => {
    const out: Interval[] = [];
    let start = first;
    for (const [gap, len] of steps) {
      out.push([start, start + len]);
      start = start + len + gap;
    }
    return out;
  });

/** Is point p inside some interval of xs? */
const covers = (xs: readonly Interval[], p: number): boolean =>
  xs.some(([s, e]) => s <= p && p <= e);

/**
 * Every integer and half-integer from just below the smallest endpoint to just
 * above the largest. Endpoints are integers, so coverage can only change at an
 * integer; checking each integer and each k + 0.5 between them covers every
 * real number.
 */
const probePoints = (...lists: readonly Interval[][]): number[] => {
  const ends = lists.flat(2);
  const lo = Math.min(0, ...ends) - 1;
  const hi = Math.max(0, ...ends) + 1;
  const ps: number[] = [];
  for (let p = lo; p <= hi; p += 0.5) ps.push(p);
  return ps;
};

describe('mergeIntervals', () => {
  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const uncovered = xs.filter(([s, e]) => !out.some(([a, b]) => a <= s && e <= b));
        expect(uncovered).toEqual([]);
      }),
    );
  });

  // Add your properties here. Aim for at least one of each pattern:
  // invariant, algebraic, metamorphic, differential, conditional.
  // Pattern: invariant. Every output interval has start <= end, and the output is sorted with a gap between consecutive intervals: out[i][1] < out[i+1][0].
  it('returns sorted intervals that neither overlap nor touch', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (const [s, e] of out) expect(s).toBeLessThanOrEqual(e);
        for (let i = 0; i + 1 < out.length; i++) {
          expect(out[i][1]).toBeLessThan(out[i + 1][0]);
        }
      }),
    );
  });

  // Pattern: invariant. The input array and the intervals in it are not modified.
  it('does not modify its input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const before = structuredClone(xs);
        mergeIntervals(xs);
        expect(xs).toEqual(before);
      }),
    );
  });

  // Pattern: differential. A point p (integer or not) is covered by the output exactly when it is covered by the input.
  it('covers exactly the same points as the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const wrong = probePoints(xs, out).filter(p => covers(xs, p) !== covers(out, p));
        expect(wrong).toEqual([]);
      }),
    );
  });

  // Pattern: metamorphic. Shuffling the input does not change the output.
  it('gives the same output for any order of the input', () => {
    fc.assert(
      fc.property(listAndShuffle, ([xs, shuffled]) => {
        expect(mergeIntervals(shuffled)).toEqual(mergeIntervals(xs));
      }),
    );
  });

  // Pattern: algebraic. Merging is idempotent: merging an already-merged list gives the same list back.
  it('merging twice is the same as merging once', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Pattern: conditional. If the input intervals already neither overlap nor touch, the output is those same intervals, sorted by start.
  it('returns already-disjoint intervals unchanged, just sorted', () => {
    const disjointAndShuffled = disjointSorted.chain(sorted =>
      fc.tuple(
        fc.constant(sorted),
        fc.shuffledSubarray(sorted, { minLength: sorted.length, maxLength: sorted.length }),
      ),
    );
    fc.assert(
      fc.property(disjointAndShuffled, ([sorted, shuffled]) => {
        expect(mergeIntervals(shuffled)).toEqual(sorted);
      }),
    );
  });

});
