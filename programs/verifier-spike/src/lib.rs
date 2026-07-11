use anchor_lang::prelude::*;

mod verifying_key;

declare_id!("FTRE4a6SSMs1Y7NdLPKRnFAfGv5QhZKaW7aQPBzPT3m");

#[program]
pub mod verifier_spike {
    use super::*;

    pub fn verify(
        _ctx: Context<Verify>,
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        public_inputs: Vec<[u8; 32]>,
    ) -> Result<()> {
        let vk = &verifying_key::VERIFYING_KEY;

        if public_inputs.len() != vk.nr_pubinputs {
            return Err(ErrorCode::InvalidPublicInputs.into());
        }

        let inputs_slice: &[[u8; 32]] = public_inputs.as_slice();

        let inputs_array: &[[u8; 32]; 1] = inputs_slice
            .try_into()
            .map_err(|_| ErrorCode::InvalidPublicInputs)?;

        let mut verifier =
            groth16_solana::groth16::Groth16Verifier::new(&proof_a, &proof_b, &proof_c, inputs_array, vk)
                .map_err(|_| ErrorCode::VerificationSetupFailed)?;

        verifier
            .verify()
            .map_err(|_| ErrorCode::ProofVerificationFailed)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Verify {}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid public inputs length")]
    InvalidPublicInputs,
    #[msg("Verification setup failed")]
    VerificationSetupFailed,
    #[msg("Proof verification failed")]
    ProofVerificationFailed,
}
