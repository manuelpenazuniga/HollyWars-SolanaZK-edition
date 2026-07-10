use anchor_lang::prelude::*;
use crate::state::WarStatus;
use crate::errors::ErrorCode;
use crate::CloseWar;
use anchor_lang::solana_program::sysvar::clock::Clock;
use anchor_lang::solana_program::sysvar::Sysvar;

pub fn handler(ctx: Context<CloseWar>, _war_id: u64) -> Result<()> {
    let war = &mut ctx.accounts.war;
    require!(war.status != WarStatus::Closed, ErrorCode::AlreadyClosed);

    let clock = Clock::get().map_err(|_| error!(ErrorCode::InvalidWindow))?;
    require!(
        clock.unix_timestamp >= war.closes_at,
        ErrorCode::InvalidWindow,
    );

    war.status = WarStatus::Closed;
    Ok(())
}
