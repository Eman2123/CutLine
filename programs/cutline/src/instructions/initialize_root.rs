use anchor_lang::prelude::*;

use crate::errors::CutlineError;
use crate::state::{RootAuthorization, Vault, ROOT_SEED, VAULT_SEED};

#[derive(Accounts)]
#[instruction(root_id: u64)]
pub struct InitializeRoot<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + RootAuthorization::INIT_SPACE,
        seeds = [ROOT_SEED, owner.key().as_ref(), &root_id.to_le_bytes()],
        bump
    )]
    pub root: Account<'info, RootAuthorization>,

    #[account(
        init,
        payer = owner,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, root.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn handle(ctx: Context<InitializeRoot>, root_id: u64, budget_cap: u64) -> Result<()> {
    require!(budget_cap > 0, CutlineError::InvalidBudgetCap);

    let now = Clock::get()?.unix_timestamp;

    let root = &mut ctx.accounts.root;
    root.owner = ctx.accounts.owner.key();
    root.root_id = root_id;
    root.epoch = 1;
    root.active = true;
    root.created_at = now;
    root.revoked_at = 0;
    root.bump = ctx.bumps.root;

    let vault = &mut ctx.accounts.vault;
    vault.root = root.key();
    vault.budget_cap = budget_cap;
    vault.spent = 0;
    vault.bump = ctx.bumps.vault;

    Ok(())
}
