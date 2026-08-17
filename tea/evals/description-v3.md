Disciplines how the agent spends context: locate before reading, patch
instead of rewriting, and resolve uncertainty before editing. Cuts
session cost by removing wasted reads, whole-file rewrites, and retry
loops. It never shortens code or prose — only the wasted work around
them.

Use PROACTIVELY, loading it FIRST — before opening any file — on EVERY
multi-step coding task: editing across files, debugging, refactoring,
reviewing, planning a change, and read-only work too —
navigating a codebase, tracing a flow or call path, mapping structure,
answering "where is X handled?". If the task spans multiple files or
steps, it applies — without the user asking. Also use when the user says
"tea", "context budget", "too many tokens", "this session is expensive",
or complains about re-reading and rewriting.

Do NOT use for non-coding requests (prose, translation, summaries,
general knowledge), and never as an instruction to shorten code,
compress identifiers, or golf.
