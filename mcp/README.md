# Oira concierge MCP server

A governed MCP tool layer over the Oira concierge. See `docs/MCP-ARCHITECTURE.md` for the design
and THE RULE (MCP is for advisory agents only; seal/match/settle stays deterministic and outside).

## What it exposes (advisory, read-only)
- `check_colour(hex, palette)`: does this shade suit her? (the real concierge judgement)
- `ask_oira(question, palette)`: season, offers, privacy, history, recommendations.

There is deliberately **no** seal/match/settle/payout tool. Money movement never touches an LLM.

## Guardrails (enforced on every call)
- **Allowlist**: only the two tools above may run.
- **Redaction by schema**: `palette` is `.strict()`; any unknown key (a raw selfie, ITA°, key,
  wallet, nonce, verdict...) is rejected. A deny-list scan is a second line of defence.
- **Input validation**: hex format, question length.
- **Rate limit**: per process (`OIRA_MCP_MAX`, default 120/min).
- **Audit log**: every call (tool, arg hash, result hash, allow/deny) to `OIRA_MCP_AUDIT`
  (default `/tmp/oira-mcp-audit.log`) and stderr.

The tools reuse the **real** `app/concierge.js` (single source of truth), so they never drift from
what she sees in the app, and they only ever get the whitelisted `palette` (never raw traits).

## Run
```
cd mcp && npm install
node oira-mcp-server.mjs      # speaks MCP over stdio
npm test                      # or: node e2e/test-mcp.mjs  (10 checks, incl. a live client<->server round-trip)
```

## Connect an agent (e.g. Claude Desktop)
Add to the MCP client config:
```json
{ "mcpServers": { "oira-concierge": { "command": "node", "args": ["/path/to/oira/mcp/oira-mcp-server.mjs"] } } }
```
The agent (or a future on-device Gemma model) then calls `check_colour` and `ask_oira`,
passing only the coarse palette. Same boundary as the app's `buildContext()`.

## Next
- Add read-only, provenance-style tools (`rag_search`, `onchain_read`, `speak`) behind the
  same policy layer.
- When a state-changing tool is ever needed, split it: the LLM tool only *proposes*; a separate
  non-LLM verifier applies it under fixed rules (the deterministic gate).
