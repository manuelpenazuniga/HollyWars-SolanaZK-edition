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
}
