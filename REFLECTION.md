# Reflection

**Name / Andrew ID:** bgisagew

**Recitation group members (Task 2):** None

---

### 1. Valid but weak

Pick a property you wrote that passes on the correct implementation but
kills few or no mutants. Why is it still a *valid* property? Describe a
concrete bug (not one of our mutants) that it *would* catch.

**Property:** "only uses the colors G, Y, B" (Wordle, invariant). It kills no
mutants. It's still valid because the spec says every position gets exactly
one of G, Y, B, so any correct implementation passes it. It would catch a bug
like initializing the result as `new Array(5)` and only ever writing G or Y,
which leaves `undefined` where a B should be. It would also catch returning
lowercase `'g'`.

### 2. A generator problem, not a property problem

Describe a mutant, from either task, that survived or was flaky because of
your **generator** rather than your property. What did the generator fail to
produce? How did you fix it? Paste the runner output from before and after.

**Mutant:** `touchingNotMerged` (intervals). With a full-range generator
(`fc.integer()` endpoints, swapped into order), two intervals almost never
share an endpoint exactly, so `[1,3]` + `[3,5]` never shows up and the
mutant survives. The property was fine. The generator couldn't reach the bug.
(In this run the differential test checked points around each endpoint,
because the half-step probe can't handle huge numbers.)

Before:

```text
  ✘ touchingNotMerged       SURVIVED
Mutation score: 6/7 killed (86%)
```

**Fix:** build each interval as a start in −100..100 plus a length in 0..20.
The small range makes shared endpoints common.

After:

```text
  ✔ touchingNotMerged       killed  by: returns sorted intervals that neither overlap nor touch; gives the same output for any order of the input
      Counterexample: [[[-100,-88],[-88,-88]]]
      AssertionError: expected -88 to be less than -88
Mutation score: 7/7 killed (100%)
```

### 3. Reading a counterexample

Paste one counterexample that the mutation runner printed for a killed
mutant. In 2–3 sentences, explain using the *specification* why that input
exposes the bug.

```text
  ✔ mergesIntegerNeighbors  killed  by: covers exactly the same points as the input; returns already-disjoint intervals unchanged, just sorted
      Counterexample: [[[25,25],[26,26]]]
      AssertionError: expected [ 25.5 ] to deeply equal []
```

The spec says the output must cover exactly the same points as the input,
counting all real numbers, not just integers. `[25,25]` and `[26,26]` leave
a gap (25 < x < 26), so they must stay separate. The mutant merged them into
`[25,26]`, which covers 25.5 even though no input interval does.

### 4. Your project

Name one function or module in your team's project that would benefit from
property-based testing. State two properties in English, name the pattern of
each, and describe the generator you'd need, including anything about its
inputs that a naive generator would get wrong.

**Function:** `repoName(url)` in OpenCode's clone route
(`packages/opencode/src/server/routes/instance/httpapi/clone.ts`). It turns a
public HTTPS git URL into the folder name used under `~/projects`.

- **Invariant:** whenever `repoName` returns a name, it is one safe folder
  name: only `[A-Za-z0-9_.-]`, not starting with `.`, so
  `path.join(parent, name)` stays directly inside `~/projects`.
- **Metamorphic:** adding a trailing `/`, a query string, or a fragment to a
  valid repo URL doesn't change the name. For example,
  `https://github.com/o/repo` and `https://github.com/o/repo/?tab=x#top`
  both give `repo`.

**Generator:** build URLs from parts: scheme, optional `user:pass@`, host,
path segments, optional `.git`, query, and fragment. `fc.string()` would
almost never produce a valid HTTPS URL, so the invariant would pass without
testing anything. `fc.webUrl()` wouldn't produce the risky inputs either:
`..` or `%2e%2e` segments, names starting with `.`, encoded slashes (`%2F`),
credentials, or a trailing `.git/`.
