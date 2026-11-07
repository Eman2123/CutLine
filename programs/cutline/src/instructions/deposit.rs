use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::errors::CutlineError;
use crate::state::{RootAuthorization, Vault, ROOT_SEED, VAULT_SEED};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [ROOT_SEED, root.owner.as_ref(), &root.root_id.to_le_bytes()],
        bump = root.bump,
        constraint = root.owner == owner.key() @ CutlineError::UnauthorizedOwner,
    )]
    pub root: Account<'info, RootAuthorization>,

    #[account(
        mut,
        seeds = [VAULT_SEED, root.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn handle(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, CutlineError::InvalidAmount);
    require!(ctx.accounts.root.active, CutlineError::RootInactive);

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )
}
