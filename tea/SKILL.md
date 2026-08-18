---
name: tea
description: >-
  Disciplines how the agent spends context: locate before reading, patch
  instead of rewriting, and resolve uncertainty before editing rather than
  after. Cuts total session cost by removing wasted reads, whole-file
  rewrites, and retry loops. It does not shorten code or prose — it reduces
  how much work the agent does to get the same result.

  Use on ANY multi-step coding task: navigating or reading a codebase,
  editing across files, debugging, refactoring, reviewing, investigating a
  failure, or planning a change. Also use whenever the user mentions "tea",
  "context budget", "too many tokens", "this session is expensive", "this
  is slow", or complains that the agent keeps re-reading files, rewrites
  whole files, or goes in circles.

  Do NOT use for non-coding requests (prose, translation, summaries,
  general knowledge), and never as an instruction to shorten code,
  compress identifiers, or golf.
---

# tea — context discipline

Active on every turn of a coding task. Do not drift back to read-everything,
rewrite-everything defaults mid-session. Still active when uncertain. Off only
on explicit "stop tea" / "normal mode".

## Ladder — walk before every action, stop at the first gate that holds

- L1 Does this action need more context? If not, act now.
- L2 Can the target be pinned to a smaller unit? Locate it by search first.
- L3 Is the edit scope settled? If not, settle it before touching anything.
- L4 Will a bounded patch do? Rewrite a whole file only for structural change.

When rules collide: THINK outranks READ, and T3 outranks R1–R3. A wrong edit
costs more in retries than any avoided lookup ever saves.

## READ — know where before what

File reads dominate what flows into context, and most reads pull in far more
than the task needs. The aim is not reading less — it is knowing where to read
first.

- R1 Pin the target by search before opening any file.
- R2 Read only the confirmed range. Whole-file reads are for structure or a
  first visit.
- R3 Do not reopen a file already read this session; verifying your own edit
  is the exception.
- R4 Walk directories only as deep as the task requires.

## WRITE — patch in place

How you edit sets both the output volume and every later turn's reading cost.
Whether code lives in one file or five is a question of reference hops, not
line count — each extra hop bills a fixed read.

- W1 Prefer partial replacement; rewrite whole files only for structural
  change.
- W2 Make edit anchors as narrow as they can be while staying unique.
  Repeated anchor misses mean W2 is over-applied — widen the anchors.
- W3 Extend an existing file before creating a new one.
- W4 Create tests, READMEs, examples, or configs only when asked.
- W5 Do not restate in prose what the diff already shows. Design rationale,
  remaining choices, side effects, and anything needing the user's judgment
  are not restatement — always say those.

## THINK — settle before editing

One retry cancels dozens of avoided reads. Turn count multiplies everything
else, so this axis outranks the other two.

- T1 When undoing would cost more than checking, check first.
- T2 Resolve open design choices before the first edit.
- T3 Never edit code whose current state you have not seen.

## Boundaries — where each rule stops

- R2 targets known symbols; architecture surveys and first entries may read
  whole files.
- R3 permits re-reading after your own edit or an external change.
- W1 yields for structural moves and mass renames.
- W4 yields the moment the user asks for the artifact.
- T1 skips trivial, instantly verifiable fixes.

## Never, regardless of any rule above

- X1 Do not abbreviate identifiers.
- X2 Do not compress wording while keeping its meaning.
- X3 Do not stray from idiomatic style.
- X4 Do not merge separate statements into one line.

## Inviolable

Never weaken trust-boundary validation, exception handling, data-loss
protection, security, or accessibility. No rule above justifies it.

## When Ponytail is absent

- P1 Before writing new code, check whether existing code, the standard
  library, or the platform already solves it.

If the Ponytail skill is active, defer implementation-size judgment to it
entirely.

## References — load only when needed

- references/read.md — borderline READ calls (survey vs. range read)
- references/write.md — borderline WRITE calls (split vs. extend, anchor width)
- references/think.md — check-first judgment calls
- references/boundaries.md — cases where the X rules or the inviolable list
  could be misread
- references/spec.md — full specification (maintenance only)
