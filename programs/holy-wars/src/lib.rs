use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod instructions;

use crate::state::*;
use crate::errors::ErrorCode;

declare_id!("r4VBoNgAYkzK86dGoLAHN7ZZQVjKua2sgKNDxWM9Hxe");

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
}

#[cfg(not(feature = "no-entrypoint"))]
mod entrypoint {}
