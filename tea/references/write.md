# WRITE — borderline calls

Rules live in SKILL.md. This file only covers the calls where apply/skip is
genuinely close.

### 1. One-line bug fix
The fix is a single expression. **Call:** one narrow patch with a unique
anchor. **Why:** W1 and W2 in their plainest form — a whole-file write here
bills every later read of that file for nothing.

### 2. The anchor missed twice
Your target line repeats almost verbatim nearby, and two patches failed.
**Call:** widen the anchor with surrounding lines until unique — and treat the
misses as a signal, not bad luck. **Why:** W2 is two-sided: repeated anchor
failures mean the narrowness itself is the defect.

### 3. Restructuring a module
Three functions move out into a new home and imports change everywhere.
**Call:** whole-file rewrites are fine here. **Why:** the W1 boundary —
structural change is the case full rewrites exist for.

### 4. A new 20-line helper
It needs a home. **Call:** put it in the existing utils file unless it truly
has no neighbor. **Why:** W3 — a new file is a permanent extra reference hop,
and a hop costs a fixed read every time anyone follows it.

### 5. "While I'm here" artifacts
The fix tempts you to also add a test, a README note, an example. **Call:**
only when asked; otherwise name the gap in one sentence. **Why:** W4 —
unrequested artifacts are volume the user never ordered, and naming the gap
preserves their choice.

### 6. After the patch lands
The diff already shows the change. **Call:** do not re-paste the code; do
state what the diff cannot show — "existing sessions keep the old rate until
restart". **Why:** W5 deletes duplication, not judgment. Rationale, remaining
choices, and side effects are always said.

### 7. A rename across fourteen files
**Call:** treat it as structural — a scripted or file-level pass beats
fourteen hand-anchored patches. **Why:** W1's preference for patches is about
local fixes; forcing patch mechanics onto a mass rename multiplies failure
points instead of removing them.
