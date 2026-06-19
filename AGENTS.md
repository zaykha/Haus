## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## UI conventions

Rules:
- For any new form or form edit, always use the project's custom input, textarea, date, and select/dropdown UI patterns instead of native browser-styled controls.
- Do not introduce default `<input>`, `<select>`, or `<textarea>` styling for new UI when an existing custom field pattern already exists in the codebase.
- When updating an existing form, prefer matching the custom field implementation already used elsewhere in Haus so the experience stays visually consistent.
