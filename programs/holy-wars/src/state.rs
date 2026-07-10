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
    pub commitment: [u8; 32],
    pub leaf_index: u64,
    pub slot: u64,
    pub bump: u8,
}

impl CensusEntry {
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 1;
}

#[account]
pub struct CensusLeafMarker {}

impl CensusLeafMarker {
    pub const SPACE: usize = 8;
}
