# Spike A: ER private-read semantics (VERDICT: GATED ✓)

Question (Fable Attack 1): once a Palette is sealed private (EphemeralPermission
whitelists ONE reader = the agent), can a NON-whitelisted key RPC-read its plaintext
from the TEE? If yes, the query budget bounds brands but not the key holder.

## Result (live devnet, `client/e2e/spike-read-semantics.mjs`)
Same sealed private Palette, three readers:
- **AGENT token (whitelisted):** DATA RETURNED, full ER state (query_count, is_private=1, ...).
- **OUTSIDER token (not whitelisted):** `null (no data returned)`: **blocked**.
- **BASE RPC (public):** returns only the pre-delegation snapshot, owned by the delegation
  program (`DELeGG…`), is_private=0, encrypted 96-byte blob. Live ER state is not exposed on base.

## Conclusion
The EphemeralPermission whitelist genuinely gates ER reads. Plaintext-in-ER is sound:
an outsider with a valid TEE token cannot read the sealed account. The residual readers are
(1) the **agent key holder**: a custody problem, addressed by bounded/revocable keeper +
self-custody (Phase 3), and (2) the **TDX operator**: inherent to the platform, disclosed.
Defense in depth regardless: store traits **bucketed** (categories, not raw values) and keep
**private receipts** on base (Attack 2, separate fix). Design proceeds as planned.
