use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("FDuzi1FjZ5hPK6VxbrKvm6oJ7rWLxMWqvrRMtnsxbiwu");

#[program]
pub mod cutline {
    use super::*;

    pub fn initialize_root(
        ctx: Context<InitializeRoot>,
        root_id: u64,
        budget_cap: u64,
    ) -> Result<()> {
        initialize_root::handle(ctx, root_id, budget_cap)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        deposit::handle(ctx, amount)
    }

    pub fn create_delegation(
        ctx: Context<CreateDelegation>,
        delegate: Pubkey,
        policy: DelegationPolicy,
    ) -> Result<()> {
        create_delegation::handle(ctx, delegate, policy)
    }

    pub fn revoke_delegation(ctx: Context<RevokeDelegation>) -> Result<()> {
        revoke_delegation::handle(ctx)
    }

    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: u64,
        recipient: Pubkey,
        amount: u64,
        task_hash: [u8; 32],
    ) -> Result<()> {
        create_task::handle(ctx, task_id, recipient, amount, task_hash)
    }

    pub fn execute_task(ctx: Context<ExecuteTask>) -> Result<()> {
        execute_task::handle(ctx)
    }

    pub fn revoke_root(ctx: Context<RevokeRoot>) -> Result<()> {
        revoke_root::handle(ctx)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        withdraw::handle(ctx)
    }
}
