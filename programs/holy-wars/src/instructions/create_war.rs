use anchor_lang::prelude::*;
use crate::state::WarStatus;
use crate::errors::ErrorCode;
use crate::CreateWar;

pub fn handler(
    ctx: Context<CreateWar>,
    war_id: u64,
    topic: String,
    side_a: String,
    side_b: String,
    opens_at: i64,
    closes_at: i64,
) -> Result<()> {
    require!(topic.len() <= 64, ErrorCode::TopicTooLong);
    require!(side_a.len() <= 32, ErrorCode::SideTooLong);
    require!(side_b.len() <= 32, ErrorCode::SideTooLong);
    require!(closes_at > opens_at, ErrorCode::InvalidWindow);

    let war = &mut ctx.accounts.war;
    war.war_id = war_id;
    war.topic = topic;
    war.side_a = side_a;
    war.side_b = side_b;
    war.tally_a = 0;
    war.tally_b = 0;
    war.census_root = [0u8; 32];
    war.status = WarStatus::Open;
    war.opens_at = opens_at;
    war.closes_at = closes_at;
    war.medal_tree = Pubkey::default();
    war.bump = ctx.bumps.war;
    Ok(())
}
