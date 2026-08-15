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
