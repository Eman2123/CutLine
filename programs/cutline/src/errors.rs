use anchor_lang::prelude::*;

#[error_code]
pub enum CutlineError {
    #[msg("Budget cap must be greater than zero")]
    InvalidBudgetCap,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Signer is not the root owner")]
    UnauthorizedOwner,
    #[msg("Signer is not the delegated agent")]
    UnauthorizedAgent,
    #[msg("Root is already revoked")]
    RootAlreadyRevoked,
    #[msg("Root is inactive")]
    RootInactive,
    #[msg("Epoch overflow")]
    EpochOverflow,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Nothing to withdraw above rent-exempt minimum")]
    NothingToWithdraw,
    #[msg("Task root does not match the root account")]
    InvalidRootReference,
    #[msg("Task was issued under an older root epoch")]
    StaleEpoch,
    #[msg("Delegation is inactive, stale or expired")]
    DelegationInvalid,
    #[msg("Task is not pending")]
    TaskNotPending,
    #[msg("Recipient account does not match the task")]
    RecipientMismatch,
    #[msg("Payment violates the delegation policy")]
    PolicyViolation,
    #[msg("Vault would fall below the rent-exempt minimum")]
    InsufficientVault,
    #[msg("Policy fields are malformed")]
    InvalidPolicy,
    #[msg("This delegation cannot delegate further")]
    CannotDelegate,
    #[msg("Delegation depth exceeds the maximum of 3")]
    DepthExceeded,
}
