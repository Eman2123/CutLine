use anchor_lang::prelude::*;

pub const ROOT_SEED: &[u8] = b"root";

#[account]
#[derive(InitSpace)]
pub struct RootAuthorization {
    pub owner: Pubkey,
    pub root_id: u64,
    /// Starts at 1. Revoke increments it, so every older delegation/task goes stale.
    pub epoch: u64,
    pub active: bool,
    pub created_at: i64,
    pub revoked_at: i64,
    pub bump: u8,
}
