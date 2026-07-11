use anchor_lang::prelude::*;
use crate::state::MedalClaimed;
use crate::errors::ErrorCode;
use crate::ClaimMedal;
use crate::medal_verifying_key::MEDAL_VERIFYING_KEY;
use groth16_solana::groth16::Groth16Verifier;

// claim_medal — verifies a SECOND Groth16 proof (medal.circom, DOMAIN_MEDAL) that the
// caller belongs to this war's census, then records an anonymous medal. The medal
// nullifier is unlinkable to the vote nullifier (different domain), so claiming does not
// reveal whether/how the veteran voted. public_inputs = [root, medal_nullifier_hash, war_id].
pub fn handler(
    ctx: Context<ClaimMedal>,
    war_id: u64,
    medal_nullifier_hash_arg: [u8; 32],
    leaf_owner: Pubkey,
    proof_a: [u8; 64],
    proof_b: [u8; 128],
    proof_c: [u8; 64],
    public_inputs: [[u8; 32]; 3],
) -> Result<()> {
    let war = &ctx.accounts.war;
    let medal_nullifier_hash = public_inputs[1];

    // 0. Bind the seed argument to the verified public input. The MedalNullifier PDA is
    // seeded from `medal_nullifier_hash_arg` (Anchor cannot index public_inputs in seeds);
    // without this, the same proof could be replayed with a different arg → fresh PDA →
    // double medal. Mirrors the vote nullifier binding (INV-3 / INV-8).
    require!(
        medal_nullifier_hash_arg == medal_nullifier_hash,
        ErrorCode::NullifierMismatch,
    );

    // 1. Census must be finalized (root posted).
    require!(war.census_root != [0u8; 32], ErrorCode::RootNotPosted);

    // 2. Bind public inputs to THIS war's census (big-endian field elements).
    require!(public_inputs[0] == war.census_root, ErrorCode::RootMismatch);

    // public_inputs[2] == pad32_be(war_id): 24 zero bytes + war_id.to_be_bytes()
    let expected_war_id = {
        let mut buf = [0u8; 32];
        buf[24..32].copy_from_slice(&war_id.to_be_bytes());
        buf
    };
    require!(public_inputs[2] == expected_war_id, ErrorCode::WarIdMismatch);

    // 3. Verify Groth16 with the MEDAL verifying key (LAST gate before mutation).
    let vk = &MEDAL_VERIFYING_KEY;
    let mut verifier = Groth16Verifier::new(
        &proof_a,
        &proof_b,
        &proof_c,
        &public_inputs,
        vk,
    )
    .map_err(|_| ErrorCode::InvalidProof)?;
    verifier.verify().map_err(|_| ErrorCode::InvalidProof)?;

    // 4. Record the medal (only after the proof passes). The MedalNullifier PDA is
    // `init` in the accounts context, so a repeat claim with the same secret fails there.
    let clock = Clock::get()?;
    ctx.accounts.medal_nullifier.bump = ctx.bumps.medal_nullifier;

    let record = &mut ctx.accounts.medal_record;
    record.war_id = war_id;
    record.owner = leaf_owner;
    record.medal_nullifier_hash = medal_nullifier_hash;
    record.timestamp = clock.unix_timestamp;
    record.bump = ctx.bumps.medal_record;

    emit!(MedalClaimed {
        war_id,
        owner: leaf_owner,
        medal_nullifier_hash,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
