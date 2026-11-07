use anchor_lang::prelude::*;

use crate::errors::CutlineError;
use crate::state::{Delegation, RootAuthorization, ROOT_SEED};

#[derive(Accounts)]
pub struct RevokeDelegation<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [ROOT_SEED, root.owner.as_ref(), &root.root_id.to_le_bytes()],
        bump = root.bump,
        constraint = root.owner == owner.key() @ CutlineError::UnauthorizedOwner,
    )]
    pub root: Account<'info, RootAuthorization>,

    #[account(
        mut,
        constraint = delegation.root == root.key() @ CutlineError::InvalidRootReference,
    )]
    pub delegation: Account<'info, Delegation>,
}

/// Closes exactly one node. Use revoke_root to kill a whole tree.
pub fn handle(ctx: Context<RevokeDelegation>) -> Result<()> {
    ctx.accounts.delegation.active = false;
    Ok(())
}
