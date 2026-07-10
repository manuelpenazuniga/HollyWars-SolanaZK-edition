use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Caller is not authorized")]
    Unauthorized,
    #[msg("War is closed")]
    WarClosed,
    #[msg("Invalid time window: closes_at must be after opens_at")]
    InvalidWindow,
    #[msg("Attestation verification failed")]
    AttestationInvalid,
    #[msg("War is already closed")]
    AlreadyClosed,
    #[msg("Topic exceeds maximum length of 64 bytes")]
    TopicTooLong,
    #[msg("Side name exceeds maximum length of 32 bytes")]
    SideTooLong,
    #[msg("Registration closed: current time outside war's open window")]
    RegistrationClosed,
    #[msg("Root not posted")]
    RootNotPosted,
    #[msg("Census root mismatch")]
    RootMismatch,
    #[msg("War ID mismatch")]
    WarIdMismatch,
    #[msg("Invalid proof")]
    InvalidProof,
    #[msg("Battle cry too long (max 140 bytes)")]
    BattleCryTooLong,
    #[msg("Invalid side: must be 0 or 1")]
    InvalidSide,
    #[msg("Invalid weight: must be 1, 2, or 3")]
    InvalidWeight,
    #[msg("Nullifier hash argument does not match the verified public input")]
    NullifierMismatch,
}
