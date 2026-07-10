use anchor_lang::prelude::*;
use crate::state::{WarStatus, VoteCast};
use crate::errors::ErrorCode;
use crate::Vote;
use crate::vote_verifying_key::VOTE_VERIFYING_KEY;
use groth16_solana::groth16::Groth16Verifier;

pub fn handler(
    ctx: Context<Vote>,
    war_id: u64,
    nullifier_hash_arg: [u8; 32],
    proof_a: [u8; 64],
    proof_b: [u8; 128],
    proof_c: [u8; 64],
    public_inputs: [[u8; 32]; 5],
    battle_cry: String,
) -> Result<()> {
    let war = &ctx.accounts.war;
    let nullifier_hash = public_inputs[1];

    // 0. CRITICAL: the nullifier PDA is seeded from the `nullifier_hash_arg` instruction
    // argument (Anchor cannot index public_inputs[1] in a seeds constraint). Bind that
    // argument to the value the proof actually verifies, or an attacker could replay the
    // SAME proof with a different arg → fresh PDA → double vote (INV-3 / INV-8).
    require!(nullifier_hash_arg == nullifier_hash, ErrorCode::NullifierMismatch);

    // 1. War status & time window (cheap checks first)
    require!(war.status == WarStatus::Open, ErrorCode::WarClosed);

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= war.opens_at && clock.unix_timestamp < war.closes_at,
        ErrorCode::RegistrationClosed,
    );

    // 2. Battle cry length
    require!(battle_cry.as_bytes().len() <= 140, ErrorCode::BattleCryTooLong);

    // 3. Root must be posted
    require!(war.census_root != [0u8; 32], ErrorCode::RootNotPosted);

    // 4. Binding of public inputs (big-endian)
    require!(public_inputs[0] == war.census_root, ErrorCode::RootMismatch);

    // public_inputs[2] == pad32_be(war_id): 24 zero bytes + war_id.to_be_bytes()
    let expected_war_id = {
        let mut buf = [0u8; 32];
        buf[24..32].copy_from_slice(&war_id.to_be_bytes());
        buf
    };
    require!(public_inputs[2] == expected_war_id, ErrorCode::WarIdMismatch);

    // public_inputs[3] → side: bytes 0..31 must be 0, byte [31] ∈ {0,1}
    require!(
        public_inputs[3][0..31].iter().all(|&b| b == 0),
        ErrorCode::InvalidSide,
    );
    let side: u8 = public_inputs[3][31];
    require!(side <= 1, ErrorCode::InvalidSide);

    // public_inputs[4] → weight: bytes 0..31 must be 0, byte [31] ∈ {1,2,3}
    require!(
        public_inputs[4][0..31].iter().all(|&b| b == 0),
        ErrorCode::InvalidWeight,
    );
    let weight: u8 = public_inputs[4][31];
    require!((1..=3).contains(&weight), ErrorCode::InvalidWeight);

    // 5. Verify Groth16 (LAST gate before mutation)
    let vk = &VOTE_VERIFYING_KEY;
    let public_inputs_ref: &[[u8; 32]] = &public_inputs;
    let public_inputs_array: &[[u8; 32]; 5] = public_inputs_ref
        .try_into()
        .map_err(|_| ErrorCode::InvalidProof)?;

    let mut verifier = Groth16Verifier::new(
        &proof_a,
        &proof_b,
        &proof_c,
        public_inputs_array,
        vk,
    )
    .map_err(|_| ErrorCode::InvalidProof)?;

    verifier.verify().map_err(|_| ErrorCode::InvalidProof)?;

    // 6. Mutate tally (only after proof passes)
    let war = &mut ctx.accounts.war;
    let weight_u64 = weight as u64;
    if side == 0 {
        war.tally_a = war
            .tally_a
            .checked_add(weight_u64)
            .ok_or(ErrorCode::InvalidProof)?;
    } else {
        war.tally_b = war
            .tally_b
            .checked_add(weight_u64)
            .ok_or(ErrorCode::InvalidProof)?;
    }

    // 7. Emit event
    emit!(VoteCast {
        war_id,
        side,
        weight,
        nullifier_hash,
        battle_cry,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
