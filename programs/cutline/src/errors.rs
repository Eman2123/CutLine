use anchor_lang::prelude::*;

#[error_code]
pub enum CutlineError {
    #[msg("Budget cap must be greater than zero")]
    InvalidBudgetCap,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Signer is not the root owner")]
    UnauthorizedOwner,
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
}
