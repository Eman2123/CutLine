# CutLine

**Revocable spend authority for AI agents on Solana.**
Give the agent a policy, not your money. One `revoke_root` transaction invalidates the whole delegation tree and every queued task.

[![Solana devnet](https://img.shields.io/badge/Solana-devnet-9945FF)](https://explorer.solana.com/address/FDuzi1FjZ5hPK6VxbrKvm6oJ7rWLxMWqvrRMtnsxbiwu?cluster=devnet)
[![Anchor](https://img.shields.io/badge/Anchor-0.31.1-0A0A0A)](https://www.anchor-lang.com/)
[![Tests](https://img.shields.io/badge/tests-16%20passing-3DDC84)](#run-the-tests)
[![License](https://img.shields.io/badge/license-MIT-FFE14D)](#license)

| | |
|---|---|
| **Live dashboard** | https://cut-line-blond.vercel.app/ (reads devnet accounts directly) |
| **Program (devnet)** | [`FDuzi1FjZ5hPK6VxbrKvm6oJ7rWLxMWqvrRMtnsxbiwu`](https://explorer.solana.com/address/FDuzi1FjZ5hPK6VxbrKvm6oJ7rWLxMWqvrRMtnsxbiwu?cluster=devnet) |
| **Devnet proof** | [`docs/devnet-proof.md`](docs/devnet-proof.md), real signatures you can open in Explorer |
| **Threat model** | [`docs/threat-model.md`](docs/threat-model.md) |

## Contents

1. [The problem](#the-problem)
2. [The idea: epoch revocation](#the-idea-epoch-revocation)
3. [Architecture](#architecture)
4. [On-chain accounts](#on-chain-accounts)
5. [What `execute_task` checks](#what-execute_task-checks)
6. [Demo flow](#demo-flow)
7. [Repository layout](#repository-layout)
8. [Run the tests](#run-the-tests)
9. [Run the demo on devnet](#run-the-demo-on-devnet)
10. [Dashboard](#dashboard)
11. [Security and limitations](#security-and-limitations)
12. [Built with](#built-with)

## The problem

Authority in an agent economy is delegated down a chain: owner → agent A → agent B → agent C. When the owner revokes A,
B and C still hold their old authority, and tasks already sitting in their queues can still run. A Solana program cannot
scan for descendants, so revoking N agents takes N transactions, and a compromised agent can keep spending in the meantime.

```mermaid
flowchart LR
    subgraph before["Without CutLine"]
        direction LR
        O1["Owner revokes A"] --> A1["Agent A: revoked"]
        A1 -.-> B1["Agent B: still active"]
        B1 -.-> C1["Agent C: still active"]
        Q1[("Queued tasks: still run")]
        B1 --> Q1
    end
    subgraph after["With CutLine"]
        direction LR
        O2["Owner calls revoke_root"] --> E2["epoch 1 becomes 2"]
        E2 --> A2["Agent A: StaleEpoch"]
        E2 --> B2["Agent B: StaleEpoch"]
        E2 --> C2["Agent C: StaleEpoch"]
        E2 --> Q2[("Queued tasks: StaleEpoch")]
    end
```

## The idea: epoch revocation

1. **Epoch revocation, O(1).** Each root authorization has an `epoch`. Every delegation and every task stores the epoch it
   was issued under. `execute_task` requires `task.issued_epoch == root.epoch`, `delegation.issued_epoch == root.epoch`
   and `root.active`. `revoke_root` bumps the epoch and sets `active = false`: one write, and the whole tree is stale.
2. **Vault and policy bound the damage.** SOL sits in a vault PDA. An agent cannot touch it; it can only ask the program
   to pay, and the program checks per-transaction limit, delegation budget, vault-wide budget cap, a recipient allowlist
   (max 4) and expiry. Child policies must fit inside the parent.
3. **LLM output is never an authorization.** The model only proposes. The Anchor program decides.

```mermaid
sequenceDiagram
    autonumber
    actor Owner
    participant Program as CutLine program
    participant Root as RootAuthorization
    participant Agent
    Owner->>Program: initialize_root, deposit
    Owner->>Program: create_delegation (limit, budget, allowlist, expiry)
    Note over Root: epoch = 1, active = true
    Agent->>Program: create_task (stamped with epoch 1)
    Owner->>Program: revoke_root
    Program->>Root: epoch = 2, active = false
    Agent->>Program: execute_task
    Program-->>Agent: StaleEpoch (nothing leaves the vault)
```

## Architecture

```mermaid
flowchart TB
    Invoice["Invoice text"] --> Agent
    subgraph offchain["Off-chain"]
        Agent["Agent runtime (TypeScript)<br/>queue, drain, attacker mode"]
        LLM["LLM via AIMLAPI<br/>proposes a payment only"]
        UI["Dashboard (Next.js + Phantom)<br/>status, delegations, audit log, Revoke Root"]
        Agent <--> LLM
    end
    subgraph onchain["Solana devnet"]
        Program["CutLine Anchor program<br/>8 instructions, 4 PDA accounts"]
        Vault[("Vault PDA<br/>SOL")]
        Program --> Vault
    end
    Agent -- "create_task / execute_task<br/>(skipPreflight, logs land on-chain)" --> Program
    UI -- "reads accounts every 5 s" --> Program
    Owner(("Owner wallet")) -- "signs revoke_root<br/>in Phantom" --> UI
    Vault -- "pays only if every check passes" --> Recipient(("Allowlisted recipient"))
```

The chain is the source of truth. The agent and the dashboard only ask and display; enforcement is always on-chain, and no
backend is involved in signing.

## On-chain accounts

```mermaid
erDiagram
    ROOT_AUTHORIZATION ||--|| VAULT : "funds"
    ROOT_AUTHORIZATION ||--o{ DELEGATION : "issues"
    DELEGATION ||--o{ DELEGATION : "child (max depth 3)"
    DELEGATION ||--o{ TASK : "queues"
    ROOT_AUTHORIZATION {
        pubkey owner
        u64 root_id
        u64 epoch
        bool active
        i64 revoked_at
    }
    VAULT {
        pubkey root
        u64 budget_cap
        u64 spent
    }
    DELEGATION {
        pubkey delegate
        u8 depth
        u64 issued_epoch
        u64 per_tx_limit
        u64 budget
        u64 spent
        pubkey_x4 allowed
        i64 expires_at
        bool active
    }
    TASK {
        pubkey recipient
        u64 issued_epoch
        u64 amount
        enum status
    }
```

| Account | PDA seeds |
|---|---|
| `RootAuthorization` | `["root", owner, root_id]` |
| `Vault` | `["vault", root]` |
| `Delegation` | `["deleg", root, delegate]` |
| `Task` | `["task", delegation, task_id]` |

Instructions: `initialize_root`, `deposit`, `create_delegation`, `revoke_delegation`, `create_task`, `execute_task`,
`revoke_root`, `withdraw`.

## What `execute_task` checks

The checks run in a fixed order so errors are deterministic. State is updated before lamports move (checks, effects,
then interaction).

```mermaid
flowchart TD
    S(["execute_task"]) --> C1{"Root reference valid?"}
    C1 -- no --> X1["InvalidRootReference"]
    C1 -- yes --> C2{"task and delegation epoch equal root.epoch?"}
    C2 -- no --> X2["StaleEpoch"]
    C2 -- yes --> C3{"root.active?"}
    C3 -- no --> X3["RootInactive"]
    C3 -- yes --> C4{"Delegation matches, agent matches, active, not expired?"}
    C4 -- no --> X4["DelegationInvalid / UnauthorizedAgent"]
    C4 -- yes --> C5{"Task still Pending?"}
    C5 -- no --> X5["TaskNotPending"]
    C5 -- yes --> C6{"Recipient account matches task?"}
    C6 -- no --> X6["RecipientMismatch"]
    C6 -- yes --> C7{"Within limit, budget, vault cap, allowlist?"}
    C7 -- no --> X7["PolicyViolation"]
    C7 -- yes --> C8{"Vault stays above rent floor?"}
    C8 -- no --> X8["InsufficientVault"]
    C8 -- yes --> OK["Update state, then transfer: Executed"]
```

## Demo flow

| Step | Command | Result on devnet |
|---|---|---|
| 1 | `agent run invoices/normal.txt` | `Executed` |
| 2 | `ATTACKER_MODE=1 agent run invoices/malicious.txt` | `PolicyViolation` |
| 3 | `agent queue invoices/normal.txt` | task waits in the queue |
| 4 | `revoke` | `revoke_root`, epoch 1 → 2 |
| 5 | `agent drain` | `StaleEpoch` |

Signatures for each step are in [`docs/devnet-proof.md`](docs/devnet-proof.md).

## Repository layout

```
programs/cutline/   Anchor program: 4 PDA accounts, 8 instructions
tests/              16 Anchor tests (T1-T14 plus withdraw and a race test)
agent/              TypeScript runtime: LLM tool call, revocation-aware queue, attacker mode
frontend/           Next.js dashboard with Phantom: status, vault, delegations, tasks, audit log, Revoke Root
docs/               threat model, devnet proof
```

## Run the tests

Anchor CLI 0.31.1 (`anchor-lang` 0.31.3), Solana CLI / Agave 4.3.2 (platform-tools v1.57, rustc 1.95.0 for SBF),
host Rust 1.99.1, Node 24.10.0, Yarn 1.22.22. Built on Ubuntu 24.04 (WSL2). `Cargo.lock` pins `blake3 1.8.2`.

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
Never commit `.env` or keypair files; both are in `.gitignore`.

## Dashboard

Live: https://cut-line-blond.vercel.app/

```bash
cd frontend
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_ROOT_OWNER and NEXT_PUBLIC_ROOT_ID
npm run dev
```

It reads accounts straight from devnet (the chain is the source of truth). The Revoke Root button opens a confirmation
modal and the owner signs in Phantom; no backend is involved in signing. Rejected attempts in the audit log show the
program's own error code.

## Security and limitations

Assumption: the agent key, the agent process and its LLM can be fully controlled by an attacker. The owner's wallet key is
safe. Full table of attacks and defenses: [`docs/threat-model.md`](docs/threat-model.md).

| Attack | Defense | Result |
|---|---|---|
| Prompt injection: pay an attacker address | on-chain allowlist and per-tx limit | `PolicyViolation` |
| Run an old task after revoke | `task.issued_epoch != root.epoch` | `StaleEpoch` |
| Replay the same task | status must be `Pending` | `TaskNotPending` |
| Revoke from another wallet | `root.owner == signer` | `UnauthorizedOwner` |

Honest limits: transactions that landed before the revoke are not undone (loss is bounded by the budget), off-chain side
effects cannot be reversed, owner key compromise is out of scope, SOL only, devnet only, not audited.

## Built with

Solana, Anchor, Rust, TypeScript, Next.js, Tailwind CSS, Solana Wallet Adapter (Phantom), Vercel. The agent calls an
OpenAI-compatible API (AIMLAPI). This project was built with AI assistance (Claude) for code, documentation and design;
the on-chain behavior is covered by the tests and the devnet proof above.

## License

MIT
