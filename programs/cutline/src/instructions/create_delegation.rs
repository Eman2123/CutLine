use anchor_lang::prelude::*;

use crate::errors::CutlineError;
use crate::state::{
    Delegation, RootAuthorization, Vault, DELEG_SEED, MAX_ALLOWED, MAX_DEPTH, ROOT_SEED,
    VAULT_SEED,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DelegationPolicy {
    pub per_tx_limit: u64,
    pub budget: u64,
    pub allowed: [Pubkey; MAX_ALLOWED],
    pub allowed_len: u8,
    pub can_delegate: bool,
    pub expires_at: i64,
}

#[derive(Accounts)]
#[instruction(delegate: Pubkey)]
pub struct CreateDelegation<'info> {
    /// Owner (depth 1) or the parent agent (deeper levels).
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [ROOT_SEED, root.owner.as_ref(), &root.root_id.to_le_bytes()],
        bump = root.bump,
    )]
    pub root: Account<'info, RootAuthorization>,

    #[account(
        seeds = [VAULT_SEED, root.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    /// Pass None when the owner delegates directly; Some(parent) for agent-to-agent.
    pub parent_delegation: Option<Account<'info, Delegation>>,

    #[account(
        init,
        payer = signer,
        space = 8 + Delegation::INIT_SPACE,
        seeds = [DELEG_SEED, root.key().as_ref(), delegate.as_ref()],
        bump
    )]
    pub delegation: Account<'info, Delegation>,

    pub system_program: Program<'info, System>,
}

pub fn handle(
    ctx: Context<CreateDelegation>,
    delegate: Pubkey,
    policy: DelegationPolicy,
) -> Result<()> {
    let root_key = ctx.accounts.root.key();
    let root_epoch = ctx.accounts.root.epoch;
    let signer = ctx.accounts.signer.key();
    let now = Clock::get()?.unix_timestamp;

    require!(ctx.accounts.root.active, CutlineError::RootInactive);

    // Shape checks.
    require!(
        (policy.allowed_len as usize) <= MAX_ALLOWED
            && policy.per_tx_limit > 0
            && policy.per_tx_limit <= policy.budget
            && policy.expires_at > now,
        CutlineError::InvalidPolicy
    );

    let (parent_key, depth) = match &ctx.accounts.parent_delegation {
        None => {
            require_keys_eq!(
                signer,
                ctx.accounts.root.owner,
                CutlineError::UnauthorizedOwner
            );
            require!(
                policy.budget <= ctx.accounts.vault.budget_cap,
                CutlineError::PolicyViolation
            );
            (root_key, 1u8)
        }
        Some(p) => {
            require_keys_eq!(p.root, root_key, CutlineError::InvalidRootReference);
            require_keys_eq!(p.delegate, signer, CutlineError::UnauthorizedAgent);
            require!(
                p.active && p.issued_epoch == root_epoch && now < p.expires_at,
                CutlineError::DelegationInvalid
            );
            require!(p.can_delegate, CutlineError::CannotDelegate);
            require!(p.depth < MAX_DEPTH, CutlineError::DepthExceeded);

            // A child policy can never be wider than its parent.
            let subset = policy.allowed[..policy.allowed_len as usize]
                .iter()
                .all(|k| p.allows(k));
            require!(
                policy.per_tx_limit <= p.per_tx_limit
                    && policy.budget <= p.budget
                    && policy.expires_at <= p.expires_at
                    && subset,
                CutlineError::PolicyViolation
            );
            (p.key(), p.depth + 1)
        }
    };

    let d = &mut ctx.accounts.delegation;
    d.root = root_key;
    d.parent = parent_key;
    d.delegate = delegate;
    d.depth = depth;
    d.issued_epoch = root_epoch;
    d.per_tx_limit = policy.per_tx_limit;
    d.budget = policy.budget;
    d.spent = 0;
    d.allowed = policy.allowed;
    d.allowed_len = policy.allowed_len;
    d.can_delegate = policy.can_delegate;
    d.expires_at = policy.expires_at;
    d.active = true;
    d.bump = ctx.bumps.delegation;

    Ok(())
}
