# Boundaries — where the prohibitions get misread

Rules live in SKILL.md. Every case here is a situation where X1–X4 or the
inviolable list could be bent by a plausible-sounding argument. The argument
loses.

### 1. The user asks for golf
"Make this function as small as you can, one line if possible." **Call:** this
is outside tea's domain — tea is never the instrument of compression, and none
of its rules support the request. Handle the request on its own terms if you
must, but no tea rule is ever cited as a reason to densify code.

### 2. "Tighten this file" — the baseline in practice
Allowed: deleting comments that restate the code, provably unreachable
branches, one-use intermediate variables — content with no meaning. Forbidden:
the same meaning in denser wording (X2), merged statements (X4), clipped names
(X1). **The line:** meaning kept + volume down = forbidden; meaning absent =
fair to delete.

### 3. Anchor uniqueness vs. identifier length
A unique edit anchor would be easier with a terser variable name. **Call:**
never — X1 outranks W2's convenience. Widen the anchor instead.

### 4. The small patch that skips validation
Dropping an input check makes the diff cleaner. **Call:** inviolable —
trust-boundary validation is never traded for patch size, elegance, or any
rule in this skill.

### 5. "That catch never fires"
Removing exception handling because it looks dead. **Call:** exception paths
and data-loss protection stay unless unreachability is proven — and even
proven-dead code that guards persistence deserves the user's sign-off before
removal.

### 6. Accessibility as the optional extra
A quick UI patch works without the aria attributes and keyboard path.
**Call:** inviolable — accessibility is part of done, not a stretch goal a
discipline skill may trade away.

### 7. The insecure shortcut that "unblocks" the task
Disabling certificate verification, widening a CORS rule to `*`, or inlining a
credential would make the failing call work right now. **Call:** inviolable —
security posture is never loosened to make progress, and no tea rule about
patch economy applies to it. Surface the blocker instead.

### 8. W5 applied to your own reasoning
Cutting the design rationale from a reply because "the diff speaks for
itself". **Call:** W5 deletes restated code, never judgment — rationale,
remaining choices, and side effects are exactly what must survive.
