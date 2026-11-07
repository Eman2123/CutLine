use anchor_lang::prelude::*;

use crate::errors::CutlineError;
use crate::state::{RootAuthorization, Vault, ROOT_SEED, VAULT_SEED};

#[derive(Accounts)]
pub struct Withdraw<'info> {
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
}

/// Owner can always pull back whatever sits above the rent-exempt minimum,
/// including after the root has been revoked.
pub fn handle(ctx: Context<Withdraw>) -> Result<()> {
    let vault_info = ctx.accounts.vault.to_account_info();
    let rent_min = Rent::get()?.minimum_balance(vault_info.data_len());

    let amount = vault_info
        .lamports()
        .checked_sub(rent_min)
        .ok_or(CutlineError::MathOverflow)?;
    require!(amount > 0, CutlineError::NothingToWithdraw);

    let owner_info = ctx.accounts.owner.to_account_info();
    **vault_info.try_borrow_mut_lamports()? = vault_info
        .lamports()
        .checked_sub(amount)
        .ok_or(CutlineError::MathOverflow)?;
    **owner_info.try_borrow_mut_lamports()? = owner_info
        .lamports()
        .checked_add(amount)
        .ok_or(CutlineError::MathOverflow)?;

    Ok(())
}
