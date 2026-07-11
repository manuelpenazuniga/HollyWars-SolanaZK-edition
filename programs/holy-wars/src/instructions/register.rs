use anchor_lang::prelude::*;
use crate::state::WarStatus;
use crate::errors::ErrorCode;
use crate::Register;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar::clock::Clock;
use anchor_lang::solana_program::sysvar::Sysvar;

pub fn handler(
    ctx: Context<Register>,
    war_id: u64,
    commitment: [u8; 32],
    github_hash: [u8; 32],
    leaf_index: u64,
) -> Result<()> {
    let war = &ctx.accounts.war;
    require!(war.status == WarStatus::Open, ErrorCode::WarClosed);

    let clock = Clock::get().map_err(|_| error!(ErrorCode::AttestationInvalid))?;
    require!(
        clock.unix_timestamp >= war.opens_at && clock.unix_timestamp < war.closes_at,
        ErrorCode::RegistrationClosed,
    );

    let mut expected_msg = Vec::with_capacity(32 + 32 + 8 + 8);
    expected_msg.extend_from_slice(&commitment);
    expected_msg.extend_from_slice(&github_hash);
    expected_msg.extend_from_slice(&war_id.to_le_bytes());
    expected_msg.extend_from_slice(&leaf_index.to_le_bytes());

    let ixs_account = ctx.accounts.instructions_sysvar.to_account_info();
    let current_index = load_current_index_checked(&ixs_account)
        .map_err(|_| error!(ErrorCode::AttestationInvalid))?;

    require!(current_index > 0, ErrorCode::AttestationInvalid);

    let ed25519_ix = load_instruction_at_checked(
        (current_index.saturating_sub(1)) as usize,
        &ixs_account,
    )
    .map_err(|_| error!(ErrorCode::AttestationInvalid))?;

    require!(
        ed25519_ix.program_id == ed25519_program::ID,
        ErrorCode::AttestationInvalid,
    );

    let data = &ed25519_ix.data;
    require!(data.len() >= 16, ErrorCode::AttestationInvalid);

    let num_signatures = data[0];
    require!(num_signatures == 1, ErrorCode::AttestationInvalid);

    let sig_ix_idx = u16::from_le_bytes([data[4], data[5]]);
    let pk_ix_idx = u16::from_le_bytes([data[8], data[9]]);
    let msg_ix_idx = u16::from_le_bytes([data[14], data[15]]);

    require!(sig_ix_idx == u16::MAX, ErrorCode::AttestationInvalid);
    require!(pk_ix_idx == u16::MAX, ErrorCode::AttestationInvalid);
    require!(msg_ix_idx == u16::MAX, ErrorCode::AttestationInvalid);

    let public_key_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let message_data_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_data_size = u16::from_le_bytes([data[12], data[13]]) as usize;

    require!(
        public_key_offset + 32 <= data.len(),
        ErrorCode::AttestationInvalid,
    );
    let attestor_pk_bytes = &data[public_key_offset..public_key_offset + 32];
    let attestor_pk =
        Pubkey::try_from(attestor_pk_bytes).map_err(|_| error!(ErrorCode::AttestationInvalid))?;

    let config = &ctx.accounts.config;
    require!(
        attestor_pk == config.attestor_pubkey,
        ErrorCode::AttestationInvalid,
    );

    require!(
        message_data_offset + message_data_size <= data.len(),
        ErrorCode::AttestationInvalid,
    );
    let msg = &data[message_data_offset..message_data_offset + message_data_size];
    require!(
        msg == expected_msg.as_slice(),
        ErrorCode::AttestationInvalid,
    );

    let entry = &mut ctx.accounts.census_entry;
    entry.war_id = war_id;
    entry.commitment = commitment;
    entry.leaf_index = leaf_index;
    entry.slot = clock.slot;
    entry.bump = ctx.bumps.census_entry;

    Ok(())
}
