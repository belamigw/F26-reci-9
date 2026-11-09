import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { matchGuess } from '../src/wordle';

// Recitation Part 1: follow along with your TA, filling in the todos below.
// Problem set Task 1: keep adding properties until `npm run mutants:wordle`
// kills every mutant. Read the spec in src/wordle/matchGuess.ts.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The result always has exactly five colors.
// (invariant, algebraic, metamorphic, differential, or conditional)

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTERS = [...ALPHABET];

/** A five-letter word using only the given letters. */
const wordFrom = (letters: readonly string[]): fc.Arbitrary<string> =>
  fc.array(fc.constantFrom(...letters), { minLength: 5, maxLength: 5 }).map(cs => cs.join(''));

// A tiny alphabet (1-3 letters) forces repeated letters and shared letters,
// which is where the yellow/black bookkeeping can go wrong. But a tiny FIXED
// alphabet like 'ABC' would hide bugs that only show up for other letters, so
// the tiny alphabet is picked at random from A-Z each time, and half the
// words use the full alphabet.
const smallAlphabet = fc.shuffledSubarray(LETTERS, { minLength: 1, maxLength: 3 });

const word: fc.Arbitrary<string> = fc.oneof(
  wordFrom(LETTERS),
  smallAlphabet.chain(ls => wordFrom(ls)),
);

// [secret, guess]. In the small-alphabet case both words share the same
// letters, so greens, yellows and duplicates all show up often.
const secretAndGuess: fc.Arbitrary<[string, string]> = fc.oneof(
  fc.tuple(wordFrom(LETTERS), wordFrom(LETTERS)),
  smallAlphabet.chain(ls => fc.tuple(wordFrom(ls), wordFrom(ls))),
);

// Targeted: a guess that is a rearrangement (anagram) of the secret.
const secretAndAnagram: fc.Arbitrary<[string, string]> = word.chain(secret =>
  fc
    .shuffledSubarray([...secret], { minLength: 5, maxLength: 5 })
    .map((cs): [string, string] => [secret, cs.join('')]),
);

// Targeted: a secret and guess with no letters in common. Shuffle the
// alphabet, cut it in two, and draw each word from a different half.
const disjointSecretAndGuess: fc.Arbitrary<[string, string]> = fc
  .tuple(
    fc.shuffledSubarray(LETTERS, { minLength: 26, maxLength: 26 }),
    fc.integer({ min: 1, max: 25 }),
  )
  .chain(([perm, cut]) => fc.tuple(wordFrom(perm.slice(0, cut)), wordFrom(perm.slice(cut))));

// A renaming of the letters: a random one-to-one map A-Z -> A-Z.
const letterRenaming = fc.shuffledSubarray(LETTERS, { minLength: 26, maxLength: 26 });
const rename = (perm: readonly string[], s: string): string =>
  [...s].map(c => perm[ALPHABET.indexOf(c)]).join('');

// Targeted: strings that break the precondition (not exactly five A-Z letters).
const invalidWord: fc.Arbitrary<string> = fc.oneof(
  // wrong length
  fc.oneof(
    fc.array(fc.constantFrom(...LETTERS), { maxLength: 4 }),
    fc.array(fc.constantFrom(...LETTERS), { minLength: 6, maxLength: 8 }),
  ).map(cs => cs.join('')),
  // right length, one bad character (lowercase, digit, space, or the
  // characters just before 'A' and just after 'Z' in ASCII)
  fc
    .tuple(
      fc.array(fc.constantFrom(...LETTERS), { minLength: 5, maxLength: 5 }),
      fc.nat({ max: 4 }),
      fc.constantFrom('a', 'e', 'z', '1', ' ', '-', '@', '[', 'É'),
    )
    .map(([cs, i, bad]) => cs.map((c, j) => (j === i ? bad : c)).join('')),
  // valid word with extra whitespace around it
  wordFrom(LETTERS).chain(w => fc.constantFrom(`${w}\n`, ` ${w}`, `${w} `)),
);

/** How many times does letter L appear in s? */
const count = (s: string, L: string): number => [...s].filter(c => c === L).length;


describe('matchGuess', () => {
  // Pattern: invariant. The result always has exactly five colors.
  it('returns exactly five colors', () => {
    fc.assert(
      fc.property(secretAndGuess, ([secret, guess]) => {
        expect(matchGuess(secret, guess)).toHaveLength(5);
      }),
    );
  });

  // Pattern: invariant. Every color in the result is G, Y, or B.
  it('only uses the colors G, Y, B', () => {
    fc.assert(
      fc.property(secretAndGuess, ([secret, guess]) => {
        for (const c of matchGuess(secret, guess)) expect(['G', 'Y', 'B']).toContain(c);
      }),
    );
  });

  // Pattern: conditional. If the guess equals the secret, every position is green.
  it('guessing the secret gives all greens', () => {
    fc.assert(
      fc.property(word, w => {
        expect(matchGuess(w, w)).toEqual(['G', 'G', 'G', 'G', 'G']);
      }),
    );
  });

  // Pattern: invariant. For every letter L, the number of non-black positions holding L in the guess is at most the number of L's in the secret.
  it('never credits a letter more times than the secret contains it', () => {
    fc.assert(
      fc.property(secretAndGuess, ([secret, guess]) => {
        const result = matchGuess(secret, guess);
        for (const L of new Set(guess)) {
          const credited = [...guess].filter((c, i) => c === L && result[i] !== 'B').length;
          expect(credited).toBeLessThanOrEqual(count(secret, L));
        }
      }),
    );
  });

  // Pattern: invariant. Position i is green exactly when guess[i] === secret[i].
  it('is green exactly where the letters match', () => {
    fc.assert(
      fc.property(secretAndGuess, ([secret, guess]) => {
        const result = matchGuess(secret, guess);
        for (let i = 0; i < 5; i++) {
          expect(result[i] === 'G').toBe(guess[i] === secret[i]);
        }
      }),
    );
  });

  // Pattern: invariant. Yellows are assigned left to right: for each letter, among its non-green positions in the guess, every yellow comes before every black.
  it('assigns yellows left to right', () => {
    fc.assert(
      fc.property(secretAndGuess, ([secret, guess]) => {
        const result = matchGuess(secret, guess);
        for (const L of new Set(guess)) {
          const colors = [...guess]
            .map((c, i) => (c === L && result[i] !== 'G' ? result[i] : ''))
            .join('');
          expect(colors).toMatch(/^Y*B*$/);
        }
      }),
    );
  });

  // Pattern: conditional. If the guess is a rearrangement of the secret, no position is black.
  it('an anagram of the secret has no blacks', () => {
    fc.assert(
      fc.property(secretAndAnagram, ([secret, guess]) => {
        expect(matchGuess(secret, guess)).not.toContain('B');
      }),
    );
  });

  // Pattern: conditional. If the guess shares no letters with the secret, every position is black.
  it('a guess with no letters from the secret is all black', () => {
    fc.assert(
      fc.property(disjointSecretAndGuess, ([secret, guess]) => {
        expect(matchGuess(secret, guess)).toEqual(['B', 'B', 'B', 'B', 'B']);
      }),
    );
  });

  // Pattern: metamorphic. Renaming letters consistently in both words (e.g. every A becomes Q, every Q becomes C, ...) does not change the result.
  it('renaming letters in both words does not change the result', () => {
    fc.assert(
      fc.property(secretAndGuess, letterRenaming, ([secret, guess], perm) => {
        expect(matchGuess(rename(perm, secret), rename(perm, guess))).toEqual(
          matchGuess(secret, guess),
        );
      }),
    );
  });

  // Pattern: conditional. If the secret or the guess is not exactly five uppercase letters A-Z, matchGuess throws a RangeError.
  it('rejects invalid words with a RangeError', () => {
    fc.assert(
      fc.property(word, invalidWord, (good, bad) => {
        expect(() => matchGuess(bad, good)).toThrow(RangeError);
        expect(() => matchGuess(good, bad)).toThrow(RangeError);
      }),
    );
  });

  // Example from the spec (not a property, just a sanity check).
  it('matches the example in the spec', () => {
    expect(matchGuess('APPLE', 'ALLEY')).toEqual(['G', 'Y', 'B', 'Y', 'B']);
  });
});
