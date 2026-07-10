use anchor_lang::prelude::*;
use crate::PostRoot;

pub fn handler(ctx: Context<PostRoot>, _war_id: u64, new_root: [u8; 32]) -> Result<()> {
    let war = &mut ctx.accounts.war;
    war.census_root = new_root;
    Ok(())
}
