# CutLine

**Revocable spend authority for AI agents on Solana.**
Give the agent a policy, not your money. One `revoke_root` transaction invalidates the whole delegation tree and every queued task.

- Program: `FDuzi1FjZ5hPK6VxbrKvm6oJ7rWLxMWqvrRMtnsxbiwu` on Solana devnet
  ([Explorer](https://explorer.solana.com/address/FDuzi1FjZ5hPK6VxbrKvm6oJ7rWLxMWqvrRMtnsxbiwu?cluster=devnet))
- Devnet transaction proof: [`docs/devnet-proof.md`](docs/devnet-proof.md)
- Threat model and limitations: [`docs/threat-model.md`](docs/threat-model.md)

## The problem

Authority in an agent economy is delegated down a chain: owner → agent A → agent B → agent C. When the owner revokes A,
B and C still hold their old authority, and tasks already in their queues can still run. A Solana program cannot scan
for descendants, so revoking N agents takes N transactions, and a compromised agent can keep spending in the meantime.

## How it works

1. **Epoch revocation, O(1).** Each root authorization has an `epoch`. Every delegation and every task stores the epoch it
   was issued under. `execute_task` requires `task.issued_epoch == root.epoch` and `delegation.issued_epoch == root.epoch`
   and `root.active`. `revoke_root` bumps the epoch and sets `active = false`: one write, and the whole tree is stale.
2. **Vault and policy bound the damage.** SOL sits in a vault PDA. An agent cannot touch it; it can only ask the program
   to pay, and the program checks per-transaction limit, delegation budget, vault-wide budget cap, a recipient allowlist
   (max 4) and expiry. Child policies must fit inside the parent.
3. **LLM output is never an authorization.** The model only proposes. The Anchor program decides.

`execute_task` checks, in a fixed order so errors are deterministic: root reference, epoch (`StaleEpoch`), root active,
delegation validity, task pending (replay protection), recipient match, spend policy, vault rent floor. State is updated
before lamports move.

## Repository

```
programs/cutline/   Anchor program: 4 PDA accounts, 8 instructions
tests/              16 Anchor tests (T1-T14 plus withdraw and a race test)
agent/              TypeScript runtime: LLM tool call, revocation-aware queue, attacker mode
frontend/           Next.js dashboard with Phantom: status, vault, delegations, tasks, audit log, Revoke Root
docs/               threat model, devnet proof
```

Accounts: `RootAuthorization` (`["root", owner, root_id]`), `Vault` (`["vault", root]`),
`Delegation` (`["deleg", root, delegate]`), `Task` (`["task", delegation, task_id]`).
Instructions: `initialize_root`, `deposit`, `create_delegation`, `revoke_delegation`, `create_task`, `execute_task`,
`revoke_root`, `withdraw`.

## Versions used

Anchor CLI 0.31.1 (`anchor-lang` 0.31.3), Solana CLI / Agave 4.3.2 (platform-tools v1.57, rustc 1.95.0 for SBF),
host Rust 1.99.1, Node 24.10.0, Yarn 1.22.22. Built on Ubuntu 24.04 (WSL2). `Cargo.lock` pins `blake3 1.8.2`.

## Run the tests

```bash
yarn install
anchor test        # starts a local validator and runs all 16 tests
```

## Run the demo on devnet

```bash
solana config set --url devnet
anchor build && anchor deploy --provider.cluster devnet

cd agent
npm install
cp .env.example .env               # fill AIMLAPI_API_KEY
npm run setup                      # creates a root, funds the vault, delegates to the agent; prints env values
npm run agent -- run invoices/normal.txt      # paid, Executed
ATTACKER_MODE=1 npm run agent -- run invoices/malicious.txt   # rejected: PolicyViolation
npm run agent -- queue invoices/normal.txt    # a task waits in the queue
npm run revoke -- --withdraw                  # owner revokes the root (epoch 1 -> 2)
npm run agent -- drain                        # queued task now fails: StaleEpoch
```

The agent sends with `skipPreflight`, so rejected transactions land on-chain with logs and a signature you can open in Explorer.

## Dashboard

```bash
cd frontend
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_ROOT_OWNER and NEXT_PUBLIC_ROOT_ID
npm run dev
```

It reads accounts straight from devnet (the chain is the source of truth). The Revoke Root button opens a confirmation
modal and the owner signs in Phantom; no backend is involved in signing. Rejected attempts in the audit log show the
program's own error code.

## Limitations

See [`docs/threat-model.md`](docs/threat-model.md). In short: already-landed transactions are not undone (loss is bounded by
the budget), off-chain side effects cannot be reversed, SOL only, devnet only, not audited.

## License

MIT
