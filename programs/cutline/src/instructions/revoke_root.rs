use anchor_lang::prelude::*;

use crate::errors::CutlineError;
use crate::state::{RootAuthorization, ROOT_SEED};

#[derive(Accounts)]
pub struct RevokeRoot<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [ROOT_SEED, root.owner.as_ref(), &root.root_id.to_le_bytes()],
        bump = root.bump,
        constraint = root.owner == owner.key() @ CutlineError::UnauthorizedOwner,
    )]
    pub root: Account<'info, RootAuthorization>,
}

#[event]
pub struct RootRevoked {
    pub root: Pubkey,
    pub new_epoch: u64,
}

pub fn handle(ctx: Context<RevokeRoot>) -> Result<()> {
    let root = &mut ctx.accounts.root;
    require!(root.active, CutlineError::RootAlreadyRevoked);

    root.epoch = root.epoch.checked_add(1).ok_or(CutlineError::EpochOverflow)?;
    root.active = false;
    root.revoked_at = Clock::get()?.unix_timestamp;

    emit!(RootRevoked {
        root: root.key(),
        new_epoch: root.epoch,
    });

    Ok(())
}
