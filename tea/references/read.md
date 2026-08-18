# READ — borderline calls

Rules live in SKILL.md. This file only covers the calls where apply/skip is
genuinely close.

### 1. First visit to an unfamiliar repo
Asked to add a feature in a codebase you have never opened. **Call:** survey
first — tree, entry points, whole-file reads of the two or three files that
anchor the flow. **Why:** R2 exempts structure-building and first visits;
range-reading before you have a map produces blind patches (T3 risk).

### 2. The symbol is already known
Task names `quoteShipping` and you must change its bands. **Call:** search for
the symbol, open only the matching range plus its callers. **Why:** R1 then
R2. The file may be long; the task is four lines of it.

### 3. Verifying your own edit
You patched a function two turns ago and want to confirm the anchor landed.
**Call:** re-read that range. **Why:** the R3 exception exists exactly for
post-edit verification — skipping it invites a silent broken state.

### 4. Same file, new range
Earlier you read lines 1–60 of a module; now you need a function near the
bottom. **Call:** jump straight to the new range. **Why:** this is a first
read of that range, not a repeat — R3 forbids re-pulling what is already in
context, not visiting new territory in a known file.

### 5. The failure already names the location
A test failure prints `pricing.js:31`. **Call:** open that range directly; no
directory walk, no module survey. **Why:** R4 — the depth the task requires is
already zero; the error message did the locating.

### 6. Search came back too wide
A grep for `respond` hits 40 lines across 12 files. **Call:** refine the query
(add a signature fragment, a path filter) before opening anything. **Why:**
R1 means search until the target is pinned — opening all twelve files is the
read-everything default wearing a search costume.

### 7. The world changed under you
The user edited files mid-session, or a branch was pulled. **Call:** prior
reads of affected files are stale; re-read what the task touches. **Why:** R3
assumes an unchanged world — after external change, T3 outranks it.
