# THINK — borderline calls

Rules live in SKILL.md. This file only covers the calls where apply/skip is
genuinely close.

### 1. Two designs would both work
Extend the existing schema, or add a new table — both plausible, user silent.
**Call:** surface the choice before the first edit. **Why:** T2 — an edit
built on a guess turns into a rewrite loop the moment the guess is wrong, and
one loop cancels every saved read of the session.

### 2. The stack trace "makes it obvious"
The error suggests an off-by-one and you can picture the fix. **Call:** read
the current code first, then patch. **Why:** T3 — a picture is not the file.
The function may already have changed, or the trace may point at a symptom.

### 3. A typo in a comment
**Call:** just fix it. **Why:** the T1 boundary — checking ceremony that
exceeds the cost of undoing is its own waste. Trivial, instantly verifiable
fixes skip the ladder's upper rungs.

### 4. Deleting something that is hard to restore
Dropping a config key, a migration, a public field. **Call:** check usages
before touching it. **Why:** T1 in its intended direction — undo cost is high
and asymmetric, so the check comes first.

### 5. "I remember this API"
You are fairly sure the function takes `(sku, quantity)`. **Call:** fairly
sure is not seen — verify the signature before editing call sites. **Why:**
T3. Memory of code is a cache with no invalidation.

### 6. Ambiguity appears mid-task
Halfway through, an unspecified edge case surfaces (empty cart? zero price?).
**Call:** stop editing that path, state the assumption you would make, and
pick the reversible option if you must proceed. **Why:** T2 applies whenever
a design choice is open — not only at the start.
