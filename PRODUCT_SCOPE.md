# rescicle first-user scope — v0.0.8

## Product hypothesis

After 10–30 minutes of ordinary conversation, a researcher can see their Question / Hypothesis / Prediction / Measurement / Data more clearly than before.

## Primary path

`Install -> select research folder -> converse via the local Claude Code -> objects appear -> confirm/correct -> link local data`

No API key is required for the primary path.

## Secondary path

Claude Code users can connect their existing Claude Code environment to rescicle through the local MCP server.

## Deliberate constraints

- No raw-data auto upload. The agent is given names and metadata; contents reach it only for files it has named as needed, read by rescicle from inside the research folder, as an excerpt, and written down as a `file_read` event. Asking the researcher to approve each file up front was asked before anyone could know which files mattered, so what is owed is the record of what was read rather than a toll before reading.
- The agent never receives the research folder as its working directory.
- AI cannot write SQLite directly; only validated domain operations are applied.
- Agent-generated scientific content starts as `proposed`.
