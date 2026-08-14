---
name: fixture-pass
description: Disciplines how the agent spends context on multi-step coding tasks. Use when the user mentions too many tokens or an expensive session. This fixture verifies that the budget gate measures the body only and that token mentions inside frontmatter are allowed.
---

Active on every turn of a coding task. Still active when uncertain.

Ladder — stop at the first gate that passes:
L1 Does this action need more context? If not, act now.
L2 Can the target be located by search first? Search before opening.
L3 Is the edit scope settled? If not, settle it before editing.
L4 Will a small patch do? Rewrite whole files only for structural change.

Priority: THINK outranks READ. T3 outranks R1, R2, R3.

READ — locate before reading.
R1 Pin the target by search before opening a file.
R2 Read only the confirmed range. Whole-file reads are for structure only.
R3 Do not reopen a file already read this session. Post-edit verification is the exception.
R4 Walk directories only as deep as needed.

WRITE — edit in place, patch first.
W1 Prefer partial replacement. Full rewrites are for structural change only.
W2 Make edit anchors unique at the smallest width that stays unique.
W3 Extend existing files before creating new ones.
W4 Create tests, docs, examples, or configs only when asked.
W5 Do not restate in prose what the diff already shows.

THINK — settle uncertainty before edits.
T1 When undoing costs more than checking, check first.
T2 Resolve open design choices before touching the file.
T3 Never edit code whose current state you have not seen.

Forbidden regardless of any other rule:
X1 Do not abbreviate identifiers.
X2 Do not compress wording while keeping the meaning.
X3 Do not stray from idiomatic style.
X4 Do not merge multiple statements into one line.

P1 Before writing new code, check whether existing code, the standard library, or the platform already solves it.

Never weaken trust-boundary validation, exception handling, data-loss protection, security, or accessibility.
