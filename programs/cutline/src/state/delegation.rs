use anchor_lang::prelude::*;

pub const DELEG_SEED: &[u8] = b"deleg";
pub const MAX_ALLOWED: usize = 4;
pub const MAX_DEPTH: u8 = 3;

#[account]
#[derive(InitSpace)]
pub struct Delegation {
    pub root: Pubkey,
    /// Root PDA (depth 1) or parent delegation PDA.
    pub parent: Pubkey,
    pub delegate: Pubkey,
    pub depth: u8,
    pub issued_epoch: u64,
    pub per_tx_limit: u64,
    pub budget: u64,
    pub spent: u64,
    pub allowed: [Pubkey; MAX_ALLOWED],
    pub allowed_len: u8,
    pub can_delegate: bool,
    pub expires_at: i64,
    pub active: bool,
    pub bump: u8,
}

impl Delegation {
    pub fn allows(&self, recipient: &Pubkey) -> bool {
        self.allowed[..self.allowed_len as usize]
            .iter()
            .any(|k| k == recipient)
    }
}
