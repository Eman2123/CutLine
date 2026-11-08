# Threat model

Assumption: the agent key, the agent process and its LLM can be fully controlled by an attacker. The owner's wallet key is safe.
The program has to protect funds and authority in that situation.

| Attack | Defense | Result |
|---|---|---|
| Prompt injection: pay an attacker address | on-chain recipient allowlist and per-tx limit | `PolicyViolation` |
| Spend beyond the budget | spent counters on the delegation and on the vault | `PolicyViolation` |
| Run an old task after revoke | `task.issued_epoch != root.epoch` | `StaleEpoch` |
| Revoke from another wallet | `root.owner == signer` | `UnauthorizedOwner` |
| Replay the same task | status must be `Pending` | `TaskNotPending` |
| Pass a fake root account | PDA seeds and `task.root` match | `InvalidRootReference` |
| Use an expired delegation | `now < expires_at` | `DelegationInvalid` |
| Widen a child policy | child must sit inside the parent | `PolicyViolation` |
| Swap the recipient account | account key must equal `task.recipient` | `RecipientMismatch` |
| Epoch overflow | `checked_add` | transaction fails |
| Drain the vault below rent | rent-exempt minimum check | `InsufficientVault` |

## Limitations

- A transaction that landed before the revoke was valid and is not undone. Loss is bounded by the budget.
- Off-chain side effects (an API the agent already called) cannot be reversed. Cancellation in the runtime is best effort.
- A failed transaction leaves no program state. The proof is the transaction signature and its program logs.
- Owner key compromise is out of scope.
- The backend is not a source of truth. Enforcement is always on-chain; the dashboard only displays state.
- MVP scope: SOL only, allowlist of at most 4 recipients, devnet, no audit.
- `revoke_delegation` closes one node. Killing a whole subtree is `revoke_root`.
