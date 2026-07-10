use anchor_lang::prelude::*;
use crate::Initialize;

pub fn handler(ctx: Context<Initialize>, attestor_pubkey: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.attestor_pubkey = attestor_pubkey;
    config.bump = ctx.bumps.config;
    Ok(())
}
