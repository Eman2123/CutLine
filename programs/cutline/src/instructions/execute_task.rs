use anchor_lang::prelude::*;

use crate::errors::CutlineError;
use crate::state::{Delegation, RootAuthorization, Task, TaskStatus, Vault, ROOT_SEED, VAULT_SEED};

#[derive(Accounts)]
pub struct ExecuteTask<'info> {
    pub agent: Signer<'info>,

    #[account(
        seeds = [ROOT_SEED, root.owner.as_ref(), &root.root_id.to_le_bytes()],
        bump = root.bump,
    )]
    pub root: Account<'info, RootAuthorization>,

    #[account(
        mut,
        seeds = [VAULT_SEED, root.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub delegation: Account<'info, Delegation>,

    #[account(mut)]
    pub task: Account<'info, Task>,

    #[account(mut)]
    pub recipient: SystemAccount<'info>,
}

/// The only instruction that moves funds. Check order is fixed so errors are
/// deterministic: StaleEpoch is reported before RootInactive after a revoke.
pub fn handle(ctx: Context<ExecuteTask>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let root = &ctx.accounts.root;
    let task = &ctx.accounts.task;
    let d = &ctx.accounts.delegation;

    // 1. Task belongs to this root.
    require_keys_eq!(task.root, root.key(), CutlineError::InvalidRootReference);
    // 2. Epoch still current.
    require!(task.issued_epoch == root.epoch, CutlineError::StaleEpoch);
    // 3. Root still active.
    require!(root.active, CutlineError::RootInactive);
    // 4. Delegation is the task's, belongs to the signer, active, current, unexpired.
    require_keys_eq!(task.delegation, d.key(), CutlineError::DelegationInvalid);
    require_keys_eq!(task.agent, ctx.accounts.agent.key(), CutlineError::UnauthorizedAgent);
    require_keys_eq!(d.delegate, ctx.accounts.agent.key(), CutlineError::UnauthorizedAgent);
    require!(
        d.active && d.issued_epoch == root.epoch && now < d.expires_at,
        CutlineError::DelegationInvalid
    );
    // 5. Replay protection.
    require!(task.status == TaskStatus::Pending, CutlineError::TaskNotPending);
    // 6. Recipient account is the one in the task.
    require_keys_eq!(
        ctx.accounts.recipient.key(),
        task.recipient,
        CutlineError::RecipientMismatch
    );
    // 7. Spend policy.
    let amount = task.amount;
    let new_deleg_spent = d.spent.checked_add(amount).ok_or(CutlineError::MathOverflow)?;
    let new_vault_spent = ctx
        .accounts
        .vault
        .spent
        .checked_add(amount)
        .ok_or(CutlineError::MathOverflow)?;
    require!(
        amount <= d.per_tx_limit
            && new_deleg_spent <= d.budget
            && new_vault_spent <= ctx.accounts.vault.budget_cap
            && d.allows(&task.recipient),
        CutlineError::PolicyViolation
    );
    // 8. Vault must stay rent-exempt.
    let vault_info = ctx.accounts.vault.to_account_info();
    let rent_min = Rent::get()?.minimum_balance(vault_info.data_len());
    let vault_after = vault_info
        .lamports()
        .checked_sub(amount)
        .ok_or(CutlineError::InsufficientVault)?;
    require!(vault_after >= rent_min, CutlineError::InsufficientVault);

    // Effects first, then the lamport move.
    ctx.accounts.task.status = TaskStatus::Executed;
    ctx.accounts.delegation.spent = new_deleg_spent;
    ctx.accounts.vault.spent = new_vault_spent;

    let recipient_info = ctx.accounts.recipient.to_account_info();
    **vault_info.try_borrow_mut_lamports()? = vault_after;
    **recipient_info.try_borrow_mut_lamports()? = recipient_info
        .lamports()
        .checked_add(amount)
        .ok_or(CutlineError::MathOverflow)?;

    Ok(())
}
