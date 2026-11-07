use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("11111111111111111111111111111111");

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

    pub fn revoke_root(ctx: Context<RevokeRoot>) -> Result<()> {
        revoke_root::handle(ctx)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        withdraw::handle(ctx)
    }
}
