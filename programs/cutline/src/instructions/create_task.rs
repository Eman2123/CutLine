use anchor_lang::prelude::*;

use crate::errors::CutlineError;
use crate::state::{
    Delegation, RootAuthorization, Task, TaskStatus, DELEG_SEED, ROOT_SEED, TASK_SEED,
};

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct CreateTask<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        seeds = [ROOT_SEED, root.owner.as_ref(), &root.root_id.to_le_bytes()],
        bump = root.bump,
    )]
    pub root: Account<'info, RootAuthorization>,

    #[account(
        seeds = [DELEG_SEED, root.key().as_ref(), agent.key().as_ref()],
        bump = delegation.bump,
    )]
    pub delegation: Account<'info, Delegation>,

    #[account(
        init,
        payer = agent,
        space = 8 + Task::INIT_SPACE,
        seeds = [TASK_SEED, delegation.key().as_ref(), &task_id.to_le_bytes()],
        bump
    )]
    pub task: Account<'info, Task>,

    pub system_program: Program<'info, System>,
}

/// Queues a payment request. Spend policy (limit, budget, allowlist) is enforced
/// in execute_task, which is the only place lamports move.
pub fn handle(
    ctx: Context<CreateTask>,
    task_id: u64,
    recipient: Pubkey,
    amount: u64,
    task_hash: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let root = &ctx.accounts.root;
    let d = &ctx.accounts.delegation;

    require!(root.active, CutlineError::RootInactive);
    require!(
        d.active && d.issued_epoch == root.epoch && now < d.expires_at,
        CutlineError::DelegationInvalid
    );
    require!(amount > 0, CutlineError::InvalidAmount);

    let t = &mut ctx.accounts.task;
    t.root = root.key();
    t.delegation = d.key();
    t.agent = ctx.accounts.agent.key();
    t.task_id = task_id;
    t.issued_epoch = root.epoch;
    t.recipient = recipient;
    t.amount = amount;
    t.task_hash = task_hash;
    t.status = TaskStatus::Pending;
    t.created_at = now;
    t.bump = ctx.bumps.task;

    Ok(())
}
