use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod instructions;
pub mod vote_verifying_key;

use crate::state::*;
use crate::errors::ErrorCode;

// NOTE (heap): no custom global allocator is needed. The vote OOM was NOT a groth16
// heap-exhaustion problem — groth16-solana verifies 5 public inputs comfortably inside
// Solana's default 32KB BumpAllocator (same as the 1-input verifier-spike). The OOM was
// a bogus ~1MB allocation caused by a malformed `#[instruction(...)]` list on `Vote`
// (see below). Once that was fixed, the default heap is sufficient.

declare_id!("FHj8baQvc17Qny8TvndTtkjh2iqKgu9ucQgynwD6J1WG");

// ── account validation structs ──

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Config::SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(war_id: u64)]
pub struct CreateWar<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = authority,
        space = War::SPACE,
        seeds = [b"war", war_id.to_le_bytes().as_ref()],
        bump
    )]
    pub war: Account<'info, War>,

    #[account(mut, address = config.authority @ ErrorCode::Unauthorized)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(war_id: u64, commitment: [u8; 32], github_hash: [u8; 32], leaf_index: u64)]
pub struct Register<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"war", war_id.to_le_bytes().as_ref()],
        bump = war.bump,
    )]
    pub war: Account<'info, War>,

    #[account(
        init,
        payer = payer,
        space = CensusEntry::SPACE,
        seeds = [b"census", war_id.to_le_bytes().as_ref(), &github_hash],
        bump
    )]
    pub census_entry: Account<'info, CensusEntry>,

    #[account(
        init,
        payer = payer,
        space = CensusLeafMarker::SPACE,
        seeds = [b"census_leaf", war_id.to_le_bytes().as_ref(), &leaf_index.to_le_bytes()],
        bump
    )]
    pub census_leaf: Account<'info, CensusLeafMarker>,

    /// CHECK: Instructions sysvar - validated via introspection functions
    pub instructions_sysvar: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(war_id: u64)]
pub struct PostRoot<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"war", war_id.to_le_bytes().as_ref()],
        bump = war.bump,
    )]
    pub war: Account<'info, War>,

    #[account(address = config.attestor_pubkey @ ErrorCode::Unauthorized)]
    pub attestor: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(war_id: u64)]
pub struct CloseWar<'info> {
    #[account(
        mut,
        seeds = [b"war", war_id.to_le_bytes().as_ref()],
        bump = war.bump,
    )]
    pub war: Account<'info, War>,

    pub closer: Signer<'info>,
}

// ROOT-CAUSE FIX (OOM): `#[instruction(...)]` must list the handler's leading args IN
// ORDER; Anchor borsh-deserializes them sequentially from the front of the ix data to
// compute seeds. The old list `(war_id, nullifier_hash, battle_cry)` skipped the four
// middle args (proof_a/b/c, public_inputs), so Anchor read `battle_cry`'s String length
// prefix from `proof_a`'s bytes → a bogus ~1MB Vec allocation → OOM before the handler.
// Only war_id + nullifier_hash are used by the `nullifier` seeds, so list just those.
#[derive(Accounts)]
#[instruction(war_id: u64, nullifier_hash: [u8;32])]
pub struct Vote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"war", war_id.to_le_bytes().as_ref()],
        bump = war.bump,
    )]
    pub war: Account<'info, War>,

    #[account(
        init,
        payer = voter,
        space = Nullifier::SPACE,
        seeds = [b"null", war_id.to_le_bytes().as_ref(), nullifier_hash.as_ref()],
        bump
    )]
    pub nullifier: Account<'info, Nullifier>,

    pub system_program: Program<'info, System>,
}

// ── program entrypoint ──

#[program]
pub mod holy_wars {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, attestor_pubkey: Pubkey) -> Result<()> {
        instructions::initialize::handler(ctx, attestor_pubkey)
    }

    pub fn create_war(
        ctx: Context<CreateWar>,
        war_id: u64,
        topic: String,
        side_a: String,
        side_b: String,
        opens_at: i64,
        closes_at: i64,
    ) -> Result<()> {
        instructions::create_war::handler(
            ctx, war_id, topic, side_a, side_b, opens_at, closes_at,
        )
    }

    pub fn register(
        ctx: Context<Register>,
        war_id: u64,
        commitment: [u8; 32],
        github_hash: [u8; 32],
        leaf_index: u64,
    ) -> Result<()> {
        instructions::register::handler(ctx, war_id, commitment, github_hash, leaf_index)
    }

    pub fn post_root(ctx: Context<PostRoot>, war_id: u64, new_root: [u8; 32]) -> Result<()> {
        instructions::post_root::handler(ctx, war_id, new_root)
    }

    pub fn close_war(ctx: Context<CloseWar>, war_id: u64) -> Result<()> {
        instructions::close_war::handler(ctx, war_id)
    }

    pub fn vote(
        ctx: Context<Vote>,
        war_id: u64,
        nullifier_hash: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        public_inputs: [[u8; 32]; 5],
        battle_cry: String,
    ) -> Result<()> {
        instructions::vote::handler(
            ctx, war_id, nullifier_hash, proof_a, proof_b, proof_c, public_inputs, battle_cry,
        )
    }
}

#[cfg(not(feature = "no-entrypoint"))]
mod entrypoint {}
