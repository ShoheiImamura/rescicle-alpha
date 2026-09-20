# rescicle first-user scope — v0.0.4

## Product hypothesis

After 10–30 minutes of ordinary conversation, a researcher can see their Question / Hypothesis / Prediction / Measurement / Data more clearly than before.

## Primary path

`Install -> select research folder -> converse via the local Claude Code -> objects appear -> confirm/correct -> link local data`

No API key is required for the primary path.

## Secondary path

Claude Code users can connect their existing Claude Code environment to rescicle through the local MCP server.

## Deliberate constraints

- No raw-data auto upload.
- The agent never receives the research folder as its working directory.
- AI cannot write SQLite directly; only validated domain operations are applied.
- Agent-generated scientific content starts as `proposed`.
