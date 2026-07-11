use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub attestor_pubkey: Pubkey,
    pub bump: u8,
}

impl Config {
    pub const SPACE: usize = 8 + 32 + 32 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum WarStatus {
    Open,
    Closed,
}

#[account]
pub struct War {
    pub war_id: u64,
    pub topic: String,
    pub side_a: String,
    pub side_b: String,
    pub tally_a: u64,
    pub tally_b: u64,
    pub census_root: [u8; 32],
    pub status: WarStatus,
    pub opens_at: i64,
    pub closes_at: i64,
    pub medal_tree: Pubkey,
    pub bump: u8,
}

impl War {
    pub const SPACE: usize = 8 + 8 + (4 + 64) + (4 + 32) + (4 + 32) + 8 + 8 + 32 + 1 + 8 + 8 + 32 + 1;
}

#[account]
pub struct CensusEntry {
    pub war_id: u64,
    pub commitment: [u8; 32],
    pub leaf_index: u64,
    pub slot: u64,
    pub bump: u8,
}

impl CensusEntry {
    pub const SPACE: usize = 8 + 8 + 32 + 8 + 8 + 1;
}

#[account]
pub struct CensusLeafMarker {}

impl CensusLeafMarker {
    pub const SPACE: usize = 8;
}

#[account]
pub struct Nullifier {
    pub bump: u8,
}

impl Nullifier {
    pub const SPACE: usize = 8 + 1;
}

#[event]
pub struct VoteCast {
    pub war_id: u64,
    pub side: u8,
    pub weight: u8,
    pub nullifier_hash: [u8; 32],
    pub battle_cry: String,
    pub timestamp: i64,
}

// Anti-double-claim marker for a medal: one per (war_id, medal_nullifier_hash).
// Seeded from the medal nullifier so the SAME census secret can claim at most one medal
// per war, while staying unlinkable to the vote nullifier (different domain, SPEC §3.2).
#[account]
pub struct MedalNullifier {
    pub bump: u8,
}

impl MedalNullifier {
    pub const SPACE: usize = 8 + 1;
}

// The medal itself — a "veterans ledger" PDA (the compressed-NFT stand-in per SPEC's
// Saturday contingency, §5). Keyed by the recipient wallet the claimer chose, which is
// deliberately NOT bound by the proof so a veteran can collect the scar on a fresh wallet
// that is uncorrelatable to their vote.
#[account]
pub struct MedalRecord {
    pub war_id: u64,
    pub owner: Pubkey,
    pub medal_nullifier_hash: [u8; 32],
    pub timestamp: i64,
    pub bump: u8,
}

impl MedalRecord {
    pub const SPACE: usize = 8 + 8 + 32 + 32 + 8 + 1;
}

#[event]
pub struct MedalClaimed {
    pub war_id: u64,
    pub owner: Pubkey,
    pub medal_nullifier_hash: [u8; 32],
    pub timestamp: i64,
}
