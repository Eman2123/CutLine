use anchor_lang::prelude::*;

pub const VAULT_SEED: &[u8] = b"vault";

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub root: Pubkey,
    /// Lamports, budget cap for the whole delegation tree.
    pub budget_cap: u64,
    pub spent: u64,
    pub bump: u8,
}
