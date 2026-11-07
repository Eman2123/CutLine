use anchor_lang::prelude::*;

pub const TASK_SEED: &[u8] = b"task";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TaskStatus {
    Pending,
    Executed,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Task {
    pub root: Pubkey,
    pub delegation: Pubkey,
    pub agent: Pubkey,
    pub task_id: u64,
    /// Root epoch at the time the task was queued.
    pub issued_epoch: u64,
    pub recipient: Pubkey,
    pub amount: u64,
    /// Commitment to the off-chain payload. Prompts and keys never go on-chain.
    pub task_hash: [u8; 32],
    pub status: TaskStatus,
    pub created_at: i64,
    pub bump: u8,
}
