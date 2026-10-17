// Oira Palette — MagicBlock Private ER (PER / TEE) program.
//
// Her beauty "Palette" is matched against brand offers WITHOUT her traits ever appearing
// in plaintext on the public base layer. The load-bearing design (Phase 1 rework):
//   • Her BUCKETED traits (undertone / Monk depth / season — categories, never raw values)
//     live in a TraitsSession account that is delegated into the Private ER (Intel TDX),
//     marked private (whitelists only her agent as reader), and never committed to base.
//   • `set_traits` runs INSIDE the enclave and cryptographically BINDS the sealed traits to
//     a commitment root the phone published at init (keccak(salt‖traits)), so the agent can
//     never substitute traits.
//   • `match_query` runs INSIDE the enclave, signed by the offline agent, READS her traits
//     and computes the real bucket-distance verdict itself — the client no longer supplies
//     the answer. Only a HASHED receipt (keccak(offer_hash‖verdict‖nonce)) reaches base, so
//     public receipts do not reveal her palette.
//   • A hard on-chain query budget provides anti-abuse rate limiting.
//
// Spikes A/B (docs/SPIKE-A-*, SPIKE-B-*) verified: the whitelist genuinely gates ER reads,
// and the operator may periodically commit ER state — hence traits are BUCKETED so any
// commit leaks categories, not a biometric vector.
//
// Build with the solana 3.1.10 toolchain (platform-tools v1.52). See docs/PER-SPIKE.md.

use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;
use ephemeral_rollups_sdk::access_control::instructions::{CreateEphemeralPermissionCpi, UpdateEphemeralPermissionCpi};
use ephemeral_rollups_sdk::access_control::structs::{
    EphemeralMembersArgs, Member, TX_BALANCES_FLAG, TX_LOGS_FLAG, TX_MESSAGE_FLAG,
};
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, CloseAccount};

declare_id!("CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP");

pub const PALETTE_SEED: &[u8] = b"palette";
pub const TRAITS_SEED: &[u8] = b"traits";        // private, never-committed bucketed traits
pub const MAX_ENC_LEN: usize = 512;              // encrypted recovery blob (belt-and-suspenders)
pub const QUERY_CAP_PER_EPOCH: u32 = 8;          // hard anti-abuse query budget per epoch
pub const LIFETIME_QUERY_CAP: u32 = 64;          // lifetime query cap
pub const EPOCH_SECS: i64 = 86_400;              // epoch = 1 day, derived IN-ENCLAVE from the clock (never caller-supplied)
pub const CAMPAIGN_SEED: &[u8] = b"campaign";
pub const ESCROW_SEED: &[u8] = b"escrow";
// Protocol treasury that collects forfeited per-query stakes (take-rate on BRAND spend, never hers).
// DEVNET: the deployer wallet. MAINNET: replace with a governance multisig before launch.
pub const TREASURY: Pubkey = anchor_lang::pubkey!("6wWrCWZ3y9UveFG1t5GzupJ1qkWn5r4QPWg8EmELA8Xz");
// SECURITY FIX: the attested MagicBlock TEE validator, pinned. Delegation previously accepted
// ANY validator supplied via remaining_accounts, letting an attacker redirect her sealed
// traits into a validator they control instead of the real TEE. Matches the client's own
// TEE_VALIDATOR constant (client/*.mjs).
pub const TEE_VALIDATOR: Pubkey = anchor_lang::pubkey!("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");
// MagicBlock's fixed accounts, pinned wherever the program hands them on.
pub const MAGIC_PROGRAM: Pubkey = anchor_lang::pubkey!("Magic11111111111111111111111111111111111111");
pub const MAGIC_CONTEXT: Pubkey = anchor_lang::pubkey!("MagicContext1111111111111111111111111111111");
pub const EPHEMERAL_VAULT: Pubkey = anchor_lang::pubkey!("MagicVau1t999999999999999999999999999999999");
pub const PERMISSION_PROGRAM: Pubkey = anchor_lang::pubkey!("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");

#[ephemeral]
#[program]
pub mod oira_palette {
    use super::*;

    /// Create her Palette vault on base. Stores an opaque recovery blob, her owner pubkey,
    /// and the COMMITMENT ROOT keccak(salt‖traits) the phone computed over her confirmed
    /// reading. Plaintext traits never touch this account. WRITE-ONCE per owner.
    pub fn init_palette(ctx: Context<InitPalette>, enc_traits: Vec<u8>, commitment_root: [u8; 32]) -> Result<()> {
        require!(enc_traits.len() <= MAX_ENC_LEN, OiraError::EncTooLong);
        require!(!enc_traits.is_empty(), OiraError::EncEmpty);
        let p = &mut ctx.accounts.palette;
        p.owner = ctx.accounts.owner.key();
        p.enc_traits = enc_traits;
        p.commitment_root = commitment_root;
        p.query_count = 0;
        p.lifetime_queries = 0;
        p.epoch = 0;
        p.is_private = false;
        p.last_verdict = 0;
        p.last_nonce = [0u8; 16];
        p.min_payout = 0;
        p.max_q_per_brand = 0;
        p.blocked_cats = 0;
        p.rules_active = false;
        p.lifetime_cap = 0;
        p.epoch_cap = 0;
        p.agent = Pubkey::default();
        p.brands = [BrandCount::default(); BRAND_SLOTS];
        p.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Create the (empty) TraitsSession account on base. It holds NO traits yet — traits are
    /// written only later, inside the enclave, by `set_traits`, so plaintext buckets never
    /// exist on public base even for one slot.
    pub fn init_traits(ctx: Context<InitTraits>) -> Result<()> {
        let t = &mut ctx.accounts.traits;
        t.owner = ctx.accounts.owner.key();
        t.undertone = 0;
        t.depth = 0;
        t.season = 0;
        t.is_sealed = false;
        t.salt = [0u8; 32];
        Ok(())
    }

    /// Her standing NIGHT RULES, enforced in-enclave while she sleeps.
    pub fn set_night_rules(ctx: Context<SetNightRules>, min_payout: u64, max_q_per_brand: u8, blocked_cats: u32, active: bool, lifetime_cap: u32, epoch_cap: u32) -> Result<()> {
        let p = &mut ctx.accounts.palette;
        p.min_payout = min_payout;
        p.max_q_per_brand = max_q_per_brand;
        p.blocked_cats = blocked_cats;
        p.rules_active = active;
        p.lifetime_cap = lifetime_cap; // 0 => protocol default; she can only TIGHTEN in practice
        p.epoch_cap = epoch_cap;       // 0 => protocol default
        p.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Delegate the Palette (receipt + budget state) into the ER (pinned TEE_VALIDATOR only).
    pub fn delegate_palette(ctx: Context<DelegatePalette>) -> Result<()> {
        let owner = ctx.accounts.owner.key();
        ctx.accounts.delegate_palette(
            &ctx.accounts.payer,
            &[PALETTE_SEED, owner.as_ref()],
            DelegateConfig { validator: Some(TEE_VALIDATOR), ..Default::default() },
        )?;
        Ok(())
    }

    /// Delegate the TraitsSession into the ER. This account is marked private and NEVER
    /// undelegated — her bucketed traits live only inside the enclave.
    pub fn delegate_traits(ctx: Context<DelegateTraits>) -> Result<()> {
        let owner = ctx.accounts.owner.key();
        ctx.accounts.delegate_traits(
            &ctx.accounts.payer,
            &[TRAITS_SEED, owner.as_ref()],
            DelegateConfig { validator: Some(TEE_VALIDATOR), ..Default::default() },
        )?;
        Ok(())
    }

    /// Mark the delegated Palette private inside the TEE, whitelisting exactly one reader.
    /// IDEMPOTENT/RE-BINDABLE: the permission group is CREATED on her first seal and UPDATED on
    /// any later one. Create is create-only in the permission program (re-running it on an
    /// existing group dies with InvalidAccountData — the bug that broke every monthly re-seal),
    /// so when the permission account already exists we issue the update CPI instead, with the
    /// palette PDA (the group's authority, established at create) signing via its seeds. This
    /// also REPAIRS palettes sealed before the deterministic-agent fix: their group is bound to
    /// a lost random agent, and the update re-points the sole reader at the current agent.
    pub fn set_palette_privacy(ctx: Context<SetPalettePrivacy>, reader: Pubkey, is_private: bool) -> Result<()> {
        let members = if is_private { vec![Member { flags: TX_LOGS_FLAG | TX_BALANCES_FLAG | TX_MESSAGE_FLAG, pubkey: reader }] } else { vec![] };
        let owner = ctx.accounts.owner.key();
        let bump = ctx.bumps.palette;
        let signer_seeds: &[&[&[u8]]] = &[&[PALETTE_SEED, owner.as_ref(), &[bump]]];
        if ctx.accounts.permission.data_is_empty() {
            CreateEphemeralPermissionCpi {
                permissioned_account: ctx.accounts.palette.to_account_info(),
                permission: ctx.accounts.permission.to_account_info(),
                payer: ctx.accounts.palette.to_account_info(),
                vault: ctx.accounts.vault.to_account_info(),
                magic_program: ctx.accounts.magic_program.to_account_info(),
                permission_program: ctx.accounts.permission_program.to_account_info(),
                args: EphemeralMembersArgs { is_private, members },
            }.invoke_signed(signer_seeds)?;
        } else {
            UpdateEphemeralPermissionCpi {
                permissioned_account: ctx.accounts.palette.to_account_info(),
                permission: ctx.accounts.permission.to_account_info(),
                payer: ctx.accounts.palette.to_account_info(),
                authority: ctx.accounts.palette.to_account_info(),
                vault: ctx.accounts.vault.to_account_info(),
                magic_program: ctx.accounts.magic_program.to_account_info(),
                permission_program: ctx.accounts.permission_program.to_account_info(),
                authority_is_signer: false, // the permissioned account (palette PDA) signs via seeds
                args: EphemeralMembersArgs { is_private, members },
            }.invoke_signed(signer_seeds)?;
        }
        let p = &mut ctx.accounts.palette;
        if is_private { p.is_private = true; p.agent = reader; } // bind the sole match_query caller
        Ok(())
    }

    /// Mark the delegated TraitsSession private inside the TEE, whitelisting only the agent.
    /// This is what makes her traits readable by the match engine but no one else.
    /// Create-or-update, same as set_palette_privacy above (re-seal idempotency + agent repair).
    pub fn set_traits_privacy(ctx: Context<SetTraitsPrivacy>, reader: Pubkey, is_private: bool) -> Result<()> {
        let members = if is_private { vec![Member { flags: TX_LOGS_FLAG | TX_BALANCES_FLAG | TX_MESSAGE_FLAG, pubkey: reader }] } else { vec![] };
        let owner = ctx.accounts.owner.key();
        let bump = ctx.bumps.traits;
        let signer_seeds: &[&[&[u8]]] = &[&[TRAITS_SEED, owner.as_ref(), &[bump]]];
        if ctx.accounts.permission.data_is_empty() {
            CreateEphemeralPermissionCpi {
                permissioned_account: ctx.accounts.traits.to_account_info(),
                permission: ctx.accounts.permission.to_account_info(),
                payer: ctx.accounts.traits.to_account_info(),
                vault: ctx.accounts.vault.to_account_info(),
                magic_program: ctx.accounts.magic_program.to_account_info(),
                permission_program: ctx.accounts.permission_program.to_account_info(),
                args: EphemeralMembersArgs { is_private, members },
            }.invoke_signed(signer_seeds)?;
        } else {
            UpdateEphemeralPermissionCpi {
                permissioned_account: ctx.accounts.traits.to_account_info(),
                permission: ctx.accounts.permission.to_account_info(),
                payer: ctx.accounts.traits.to_account_info(),
                authority: ctx.accounts.traits.to_account_info(),
                vault: ctx.accounts.vault.to_account_info(),
                magic_program: ctx.accounts.magic_program.to_account_info(),
                permission_program: ctx.accounts.permission_program.to_account_info(),
                authority_is_signer: false, // the permissioned account (traits PDA) signs via seeds
                args: EphemeralMembersArgs { is_private, members },
            }.invoke_signed(signer_seeds)?;
        }
        Ok(())
    }

    /// Write her bucketed traits INTO the private TraitsSession — runs inside the enclave,
    /// owner-signed. BINDS them to the commitment root: recomputes keccak(salt‖traits) and
    /// requires it to equal the root the phone published at init. Traits that don't match
    /// what she confirmed are rejected, so no one (agent or server) can substitute them.
    pub fn set_traits(ctx: Context<SetTraits>, undertone: u8, depth: u8, season: u8, salt: [u8; 32]) -> Result<()> {
        require!(undertone <= 3, OiraError::BadTrait);   // warm/neutral/cool/olive
        require!(depth >= 1 && depth <= 10, OiraError::BadTrait); // Monk 1-10
        require!(season <= 11, OiraError::BadTrait);      // 12 seasons
        let root = hashv(&[&salt[..], &[undertone, depth, season][..]]).to_bytes();
        require!(root == ctx.accounts.palette.commitment_root, OiraError::BindingMismatch);
        let t = &mut ctx.accounts.traits;
        t.undertone = undertone;
        t.depth = depth;
        t.season = season;
        t.is_sealed = true;
        t.salt = salt; // kept private in-enclave; high-entropy nonce source (its hash, the root, is public but 256-bit-preimage-hard)
        Ok(())
    }

    /// THE match. Runs INSIDE the TEE, signed by the agent session key (owner offline). READS
    /// her sealed traits and computes the verdict itself — the client supplies only the offer,
    /// never the answer. Enforces the query budget and her night rules on-chain. Commits only
    /// a HASHED receipt so the public base never learns which offer matched.
    pub fn match_query(ctx: Context<MatchQuery>, target_undertone: u8, target_depth: u8, target_season: u8, depth_tol: u8, offer_salt: [u8; 16]) -> Result<()> {
        require!(ctx.accounts.palette.is_private, OiraError::NotPrivate);
        require!(ctx.accounts.traits.is_sealed, OiraError::TraitsNotSealed);
        // ONLY her whitelisted agent may spend her (never-resetting) query budget — otherwise an
        // attacker could exhaust her lifetime allowance with throwaway campaigns and grief her matchability.
        require!(ctx.accounts.agent.key() == ctx.accounts.palette.agent, OiraError::UnauthorizedAgent);
        require!(ctx.accounts.campaign.active, OiraError::CampaignClosed);

        // L1 — idempotency: a repeat query of an already-answered offer is a FREE no-op, so her
        // query meter counts DISTINCT escrowed campaigns (= distinct targets), not re-checks.
        if ctx.accounts.campaign.answered { return Ok(()); }

        // The brand's COMMITTED offer. L2: the agent supplies NO target of its own — it opens the
        // campaign's on-chain COMMITMENT, so a stolen agent key can only ask "does she match THIS
        // escrowed campaign?", never sweep her space. The plaintext shade lives ONLY in this in-enclave
        // tx (whitelisted ER), never on base — base stores nothing but target_hash, so settled matches
        // no longer reconstruct her attribute space.
        let (c_target_hash, c_cat, c_payout, c_pqc, c_escrowed, c_queries, c_brand) = {
            let c = &ctx.accounts.campaign;
            (c.target_hash, c.category, c.per_accept_payout, c.per_query_cost, c.escrowed, c.queries, c.brand)
        };
        // Bind the supplied shade to the campaign's committed hash — a compromised agent cannot feed a
        // fabricated target to probe a different shade than the brand escrowed for.
        let opening = hashv(&[&offer_salt[..], &[target_undertone, target_depth, target_season, depth_tol][..]]).to_bytes();
        require!(opening == c_target_hash, OiraError::OfferMismatch);
        // L3 — escrow prices queries: a campaign may be asked at most escrowed/per_query_cost times.
        require!(c_pqc > 0, OiraError::EscrowTooSmall);
        require!((c_queries as u64) < c_escrowed / c_pqc, OiraError::QueryBudgetExceeded);

        // REAL match, computed in-enclave from her sealed traits.
        let matched = trait_match(&ctx.accounts.traits, target_undertone, target_depth, target_season, depth_tol);
        let salt = ctx.accounts.traits.salt;

        // Epoch is derived IN-ENCLAVE from the trusted ER clock, never from a caller arg — otherwise the
        // agent could hand a fresh epoch number on every call and reset the per-epoch meter at will.
        let epoch = (Clock::get()?.unix_timestamp / EPOCH_SECS) as u32;
        let p = &mut ctx.accounts.palette;
        // L4 — her-set budgets (0 => protocol defaults). A new (clock) epoch resets the per-epoch meter.
        let epoch_cap = if p.epoch_cap == 0 { QUERY_CAP_PER_EPOCH } else { p.epoch_cap };
        let lifetime_cap = if p.lifetime_cap == 0 { LIFETIME_QUERY_CAP } else { p.lifetime_cap };
        if epoch > p.epoch { p.epoch = epoch; p.query_count = 0; }
        require!(epoch >= p.epoch, OiraError::StaleEpoch);
        require!(p.query_count < epoch_cap, OiraError::QueryBudgetExceeded);
        require!(p.lifetime_queries < lifetime_cap, OiraError::LifetimeBudgetExceeded);
        // Bounded per-brand distinct-offer cap (Sybil tightening): each brand may query at most
        // `max_q_per_brand` distinct offers. 8-slot table; on a full table a NEW brand evicts the
        // smallest-count slot — this never bypasses the hard `lifetime_cap` ceiling, it only
        // approximates per-brand once >8 brands are active. (0 => disabled.)
        if p.max_q_per_brand > 0 {
            let cap = p.max_q_per_brand as u16;
            let (mut found, mut empty, mut min_i, mut min_c) = (None, None, 0usize, u16::MAX);
            for (i, s) in p.brands.iter().enumerate() {
                if s.brand == c_brand && s.count > 0 { found = Some(i); break; }
                if s.count == 0 && empty.is_none() { empty = Some(i); }
                if s.count < min_c { min_c = s.count; min_i = i; }
            }
            match found {
                Some(i) => { require!(p.brands[i].count < cap, OiraError::PerBrandCapExceeded); p.brands[i].count += 1; }
                None => { let i = empty.unwrap_or(min_i); p.brands[i] = BrandCount { brand: c_brand, count: 1 }; }
            }
        }

        // her night rules
        let cat_blocked = p.rules_active && (p.blocked_cats & (1u32 << (c_cat as u32 & 31))) != 0;
        let below_floor = p.rules_active && c_payout < p.min_payout;
        let verdict: u8 = if cat_blocked || below_floor { 2 } else if matched { 1 } else { 0 };

        p.query_count = p.query_count.saturating_add(1);
        p.lifetime_queries = p.lifetime_queries.saturating_add(1);

        // Nonce derived in-enclave from her private traits — unknown to the brand, so the
        // committed receipt hash does NOT reveal the verdict (L5). Kept PRIVATE in her Palette (which
        // never leaves the enclave); the agent reads it in-ER and discloses it ONLY on an accept.
        let lq = p.lifetime_queries.to_le_bytes();
        let nonce_full = hashv(&[&salt[..], &lq[..], c_target_hash.as_ref()]).to_bytes();
        let mut nonce = [0u8; 16];
        nonce.copy_from_slice(&nonce_full[..16]);
        p.last_verdict = verdict;
        p.last_nonce = nonce;
        p.updated_at = Clock::get()?.unix_timestamp;
        let owner = p.owner;

        // Commit the match state onto the CAMPAIGN — this is what undelegates to base for settle.
        let c = &mut ctx.accounts.campaign;
        c.answered = true;
        c.receipt = hashv(&[&c_target_hash[..], &[verdict][..], &nonce[..]]).to_bytes();
        // Commit to her payout wallet, don't publish it. base sees only H(owner‖nonce); the secret
        // nonce (128-bit, derived from her private salt) is disclosed by her agent ONLY if she accepts, so her
        // wallet is unlinkable on a match she never settles, and never leaks at all on a no-match.
        c.payee_commit = if verdict == 1 { hashv(&[owner.as_ref(), &nonce[..]]).to_bytes() } else { [0u8; 32] };
        c.queries = c.queries.saturating_add(1);
        c.spent = c.spent.saturating_add(c_pqc);
        Ok(())
    }

    /// Commit the (hashed) receipt + budget state to base. Traits are NOT part of this account.
    pub fn commit_receipt(ctx: Context<CommitPalette>) -> Result<()> {
        // The per-query verdict + secret nonce exist ONLY so her agent can read them in-ER and disclose
        // them on an accept. They must NOT survive to base: with the nonce public an observer could open
        // the campaign receipt H(target_hash‖verdict‖nonce) and recover the verdict (L5). Wipe before commit.
        ctx.accounts.palette.last_verdict = 0;
        ctx.accounts.palette.last_nonce = [0u8; 16];
        ctx.accounts.palette.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        ).commit(&[ctx.accounts.palette.to_account_info()]).build_and_invoke()?;
        Ok(())
    }

    pub fn undelegate_palette(ctx: Context<CommitPalette>) -> Result<()> {
        // Same as commit_receipt: the verdict + nonce are in-ER-only. Wipe before they cross to base.
        ctx.accounts.palette.last_verdict = 0;
        ctx.accounts.palette.last_nonce = [0u8; 16];
        ctx.accounts.palette.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        ).commit_and_undelegate(&[ctx.accounts.palette.to_account_info()]).build_and_invoke()?;
        Ok(())
    }

    // ─────────── offer_board: brand campaigns with USDC escrow ───────────

    pub fn create_campaign(ctx: Context<CreateCampaign>, offer_id: u64, category: u8, per_query_cost: u64, per_accept_payout: u64, target_hash: [u8; 32], escrow_amount: u64) -> Result<()> {
        require!(escrow_amount >= per_accept_payout, OiraError::EscrowTooSmall);
        require!(per_query_cost > 0, OiraError::EscrowTooSmall);
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.key(), Transfer {
                from: ctx.accounts.brand_token.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.brand.to_account_info(),
            }),
            escrow_amount,
        )?;
        let c = &mut ctx.accounts.campaign;
        c.brand = ctx.accounts.brand.key();
        c.mint = ctx.accounts.mint.key();
        c.offer_id = offer_id;
        c.category = category;
        c.per_query_cost = per_query_cost;
        c.per_accept_payout = per_accept_payout;
        // ONLY the commitment lands on base. The opening (shade + salt) is disclosed to her agent
        // in-enclave at match time and verified against this hash — base never stores the plaintext shade.
        c.target_hash = target_hash;
        c.escrowed = escrow_amount;
        c.spent = 0;
        c.paid = 0;
        c.queries = 0;
        c.accepts = 0;
        c.active = true;
        c.bump = ctx.bumps.campaign;
        c.answered = false;
        c.receipt = [0u8; 32];
        c.payee_commit = [0u8; 32];
        Ok(())
    }

    /// Settle an accepted offer — the payout is now AUTHORIZED BY THE REAL ON-CHAIN MATCH,
    /// not a brand-supplied boolean. The brand presents (offer_hash, verdict, nonce); the
    /// program requires the offer to be this campaign's target, the verdict to be MATCH, and
    /// sha256(offer_hash‖verdict‖nonce) to equal the committed match receipt on her Palette.
    /// She (the payee) must own the Palette. No match, no money.
    pub fn settle_offer(ctx: Context<SettleOffer>, offer_hash: [u8; 32], verdict: u8, nonce: [u8; 16]) -> Result<()> {
        // The verdict + receipt were computed IN-ENCLAVE and committed onto the campaign; the brand
        // can only settle by presenting the (verdict, nonce) her agent DISCLOSED on an accept. The
        // Palette never reaches base — the campaign carries the payee her enclave stamped on a match.
        require!(offer_hash == ctx.accounts.campaign.target_hash, OiraError::OfferMismatch);
        require!(verdict == 1, OiraError::NotAMatch);
        require!(ctx.accounts.campaign.answered, OiraError::NotAnswered);
        let receipt = hashv(&[&offer_hash[..], &[verdict][..], &nonce[..]]).to_bytes();
        require!(receipt == ctx.accounts.campaign.receipt, OiraError::ReceiptMismatch);
        // The payee was committed in-enclave as H(her wallet‖nonce); base never saw the wallet. She
        // proves ownership by re-opening the commitment with the same disclosed nonce.
        let payee_commit = hashv(&[ctx.accounts.her_token.owner.as_ref(), &nonce[..]]).to_bytes();
        require!(payee_commit == ctx.accounts.campaign.payee_commit, OiraError::PayeeMismatch);
        let (brand, oid, bump, payout, escrowed, spent, paid) = {
            let c = &ctx.accounts.campaign;
            require!(c.active, OiraError::CampaignClosed);
            require!(c.accepts == 0, OiraError::AlreadySettled); // one offer settles at most once
            (c.brand, c.offer_id, c.bump, c.per_accept_payout, c.escrowed, c.spent, c.paid)
        };
        // `spent` already carries the per-query stakes charged in-enclave by match_query.
        require!(spent.saturating_add(paid).saturating_add(payout) <= escrowed, OiraError::InsufficientEscrow);
        let oidb = oid.to_le_bytes();
        let seeds: &[&[&[u8]]] = &[&[CAMPAIGN_SEED, brand.as_ref(), oidb.as_ref(), &[bump]]];
        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.key(), Transfer {
                from: ctx.accounts.escrow.to_account_info(),
                to: ctx.accounts.her_token.to_account_info(),
                authority: ctx.accounts.campaign.to_account_info(),
            }, seeds),
            payout,
        )?;
        let c = &mut ctx.accounts.campaign;
        c.paid = c.paid.saturating_add(payout);
        c.accepts = c.accepts.saturating_add(1);
        Ok(())
    }

    pub fn close_campaign(ctx: Context<CloseCampaign>) -> Result<()> {
        let (brand, oid, bump, spent) = { let c = &ctx.accounts.campaign; (c.brand, c.offer_id, c.bump, c.spent) };
        let remaining = ctx.accounts.escrow.amount;          // escrowed − paid
        let to_treasury = spent.min(remaining);              // forfeited per-query stakes (L3 economic teeth)
        let to_brand = remaining.saturating_sub(to_treasury);
        let oidb = oid.to_le_bytes();
        let seeds: &[&[&[u8]]] = &[&[CAMPAIGN_SEED, brand.as_ref(), oidb.as_ref(), &[bump]]];
        if to_treasury > 0 {
            token::transfer(
                CpiContext::new_with_signer(ctx.accounts.token_program.key(), Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.treasury_token.to_account_info(),
                    authority: ctx.accounts.campaign.to_account_info(),
                }, seeds),
                to_treasury,
            )?;
        }
        if to_brand > 0 {
            token::transfer(
                CpiContext::new_with_signer(ctx.accounts.token_program.key(), Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.brand_token.to_account_info(),
                    authority: ctx.accounts.campaign.to_account_info(),
                }, seeds),
                to_brand,
            )?;
        }
        token::close_account(
            CpiContext::new_with_signer(ctx.accounts.token_program.key(), CloseAccount {
                account: ctx.accounts.escrow.to_account_info(),
                destination: ctx.accounts.brand.to_account_info(),
                authority: ctx.accounts.campaign.to_account_info(),
            }, seeds),
        )?;
        Ok(())
    }

    // ─────────── campaign delegation into the ER (L2/L3) ───────────
    // The brand delegates its campaign into the SAME ER as her Palette so match_query can read
    // the committed target + escrow allowance in-enclave, then undelegates it to base for settle.
    pub fn delegate_campaign(ctx: Context<DelegateCampaign>, offer_id: u64) -> Result<()> {
        let brand = ctx.accounts.brand.key();
        ctx.accounts.delegate_campaign(
            &ctx.accounts.payer,
            &[CAMPAIGN_SEED, brand.as_ref(), &offer_id.to_le_bytes()],
            DelegateConfig { validator: Some(TEE_VALIDATOR), ..Default::default() },
        )?;
        Ok(())
    }

    pub fn undelegate_campaign(ctx: Context<CommitCampaign>) -> Result<()> {
        ctx.accounts.campaign.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        ).commit_and_undelegate(&[ctx.accounts.campaign.to_account_info()]).build_and_invoke()?;
        Ok(())
    }
}

/// The real in-enclave comparison over BUCKETED traits: exact undertone + Monk depth within
/// tolerance. Season is advisory (kept for future refinement). Returns match/no-match.
fn trait_match(t: &TraitsSession, target_undertone: u8, target_depth: u8, _target_season: u8, depth_tol: u8) -> bool {
    let under_ok = t.undertone == target_undertone;
    let depth_ok = (t.depth as i16 - target_depth as i16).unsigned_abs() <= depth_tol as u16;
    under_ok && depth_ok
}

pub const BRAND_SLOTS: usize = 8; // bounded per-brand distinct-offer table (Sybil tightening)

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct BrandCount {
    pub brand: Pubkey,
    pub count: u16, // distinct offers she has answered from this brand
}

#[account]
pub struct PaletteVault {
    pub owner: Pubkey,
    pub enc_traits: Vec<u8>,       // encrypted recovery blob (base); never the match input
    pub commitment_root: [u8; 32], // sha256(salt‖traits) the phone published; binds set_traits
    pub query_count: u32,
    pub lifetime_queries: u32,     // never resets — lifetime query counter
    pub epoch: u32,
    pub is_private: bool,
    pub last_verdict: u8,          // 0 no-match, 1 match, 2 declined — in-ER scratch ONLY; wiped to 0 before the palette commits to base
    pub last_nonce: [u8; 16],      // per-query secret nonce (derived in-enclave from her traits); agent reads it in-ER to disclose on an accept, then it is wiped before commit — never reaches base
    pub updated_at: i64,
    pub min_payout: u64,
    pub max_q_per_brand: u8,
    pub blocked_cats: u32,
    pub rules_active: bool,
    pub lifetime_cap: u32,         // her-set lifetime distinct-campaign budget (0 => default LIFETIME_QUERY_CAP)
    pub epoch_cap: u32,            // her-set per-epoch budget (0 => default QUERY_CAP_PER_EPOCH)
    pub agent: Pubkey,             // the ONLY key allowed to run match_query — set at privacy seal; stops budget-exhaustion grief
    pub brands: [BrandCount; BRAND_SLOTS], // per-brand distinct-offer counts (kept last so client decoders are unaffected)
}
impl PaletteVault {
    pub const SPACE: usize = 8 + 32 + (4 + MAX_ENC_LEN) + 32 + 4 + 4 + 4 + 1 + 1 + 16 + 8 + 8 + 1 + 4 + 1 + 4 + 4 + 32 + BRAND_SLOTS * (32 + 2);
}

#[account]
pub struct TraitsSession {
    pub owner: Pubkey,
    pub undertone: u8, // 0 warm, 1 neutral, 2 cool, 3 olive
    pub depth: u8,     // Monk 1-10
    pub season: u8,    // 0-11
    pub is_sealed: bool,
    pub salt: [u8; 32], // her 256-bit commitment salt — PRIVATE (never leaves the enclave); high-entropy source for the receipt nonce
}
impl TraitsSession {
    pub const SPACE: usize = 8 + 32 + 1 + 1 + 1 + 1 + 32;
}

#[derive(Accounts)]
pub struct InitPalette<'info> {
    #[account(init, payer = owner, space = PaletteVault::SPACE, seeds = [PALETTE_SEED, owner.key().as_ref()], bump)]
    pub palette: Account<'info, PaletteVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitTraits<'info> {
    #[account(init, payer = owner, space = TraitsSession::SPACE, seeds = [TRAITS_SEED, owner.key().as_ref()], bump)]
    pub traits: Account<'info, TraitsSession>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePalette<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    // SECURITY FIX: was UncheckedAccount, used only as a PDA seed with no signature
    // requirement — anyone could delegate HER palette into a validator of their own
    // choosing. Must be her signature, not just her public key.
    pub owner: Signer<'info>,
    /// CHECK: delegated PDA, validated by the SDK macro
    #[account(mut, del)]
    pub palette: AccountInfo<'info>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateTraits<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    // SECURITY FIX: see DelegatePalette — must be her signature, not an unchecked pubkey.
    pub owner: Signer<'info>,
    /// CHECK: delegated PDA, validated by the SDK macro
    #[account(mut, del)]
    pub traits: AccountInfo<'info>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateCampaign<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    // SECURITY FIX: was UncheckedAccount — same class of bug as DelegatePalette. A brand
    // delegating its own campaign must sign for it; otherwise anyone could delegate another
    // brand's campaign into a validator of their choosing.
    pub brand: Signer<'info>,
    /// CHECK: delegated PDA, validated by the SDK macro
    #[account(mut, del)]
    pub campaign: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CommitCampaign<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    // Only once it has been answered, or by the brand that owns it.
    #[account(mut, seeds = [CAMPAIGN_SEED, campaign.brand.as_ref(), &campaign.offer_id.to_le_bytes()], bump = campaign.bump,
        constraint = campaign.answered || payer.key() == campaign.brand @ OiraError::NotAllowedToCommit)]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: pinned
    #[account(mut, address = MAGIC_CONTEXT)]
    pub magic_context: AccountInfo<'info>,
    /// CHECK: pinned
    #[account(address = MAGIC_PROGRAM)]
    pub magic_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SetPalettePrivacy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    // SECURITY FIX: was UncheckedAccount — anyone could call set_palette_privacy against
    // her PDA and install THEMSELVES as the sole whitelisted TEE reader (palette.agent),
    // then read her private state. Must be her signature.
    pub owner: Signer<'info>,
    #[account(mut, seeds = [PALETTE_SEED, owner.key().as_ref()], bump, has_one = owner)]
    pub palette: Account<'info, PaletteVault>,
    /// CHECK: permission metadata account (Permission Program)
    #[account(mut)]
    pub permission: AccountInfo<'info>,
    /// CHECK: ER vault, pinned
    #[account(mut, address = EPHEMERAL_VAULT)]
    pub vault: AccountInfo<'info>,
    /// CHECK: Magic program, pinned
    #[account(address = MAGIC_PROGRAM)]
    pub magic_program: AccountInfo<'info>,
    /// CHECK: Permission (ACL) program, pinned
    #[account(address = PERMISSION_PROGRAM)]
    pub permission_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SetTraitsPrivacy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    // SECURITY FIX: see SetPalettePrivacy — must be her signature, not an unchecked pubkey.
    pub owner: Signer<'info>,
    #[account(mut, seeds = [TRAITS_SEED, owner.key().as_ref()], bump, has_one = owner)]
    pub traits: Account<'info, TraitsSession>,
    /// CHECK: permission metadata account (Permission Program)
    #[account(mut)]
    pub permission: AccountInfo<'info>,
    /// CHECK: ER vault, pinned
    #[account(mut, address = EPHEMERAL_VAULT)]
    pub vault: AccountInfo<'info>,
    /// CHECK: Magic program, pinned
    #[account(address = MAGIC_PROGRAM)]
    pub magic_program: AccountInfo<'info>,
    /// CHECK: Permission (ACL) program, pinned
    #[account(address = PERMISSION_PROGRAM)]
    pub permission_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SetTraits<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [TRAITS_SEED, owner.key().as_ref()], bump, has_one = owner)]
    pub traits: Account<'info, TraitsSession>,
    #[account(seeds = [PALETTE_SEED, owner.key().as_ref()], bump, has_one = owner)]
    pub palette: Account<'info, PaletteVault>,
}

#[derive(Accounts)]
pub struct MatchQuery<'info> {
    /// The agent SESSION KEY — least privilege, only this instruction. Owner may be offline.
    pub agent: Signer<'info>,
    #[account(mut, seeds = [PALETTE_SEED, palette.owner.as_ref()], bump)]
    pub palette: Account<'info, PaletteVault>,
    #[account(seeds = [TRAITS_SEED, palette.owner.as_ref()], bump, has_one = owner @ OiraError::TraitsOwnerMismatch)]
    pub traits: Account<'info, TraitsSession>,
    /// CHECK: her owner pubkey, tying traits + palette to the same owner
    #[account(address = palette.owner)]
    pub owner: UncheckedAccount<'info>,
    /// The brand's campaign, co-delegated into this ER — the ONLY offer the agent can query her
    /// against (L2). Mutated in-enclave (answered/receipt/payee/queries), then undelegated to base.
    #[account(mut, seeds = [CAMPAIGN_SEED, campaign.brand.as_ref(), &campaign.offer_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, Campaign>,
}

#[derive(Accounts)]
pub struct SetNightRules<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [PALETTE_SEED, owner.key().as_ref()], bump, has_one = owner)]
    pub palette: Account<'info, PaletteVault>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitPalette<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    // Only her, or her agent.
    #[account(mut, seeds = [PALETTE_SEED, palette.owner.as_ref()], bump,
        constraint = payer.key() == palette.owner || payer.key() == palette.agent @ OiraError::NotAllowedToCommit)]
    pub palette: Account<'info, PaletteVault>,
    /// CHECK: pinned
    #[account(mut, address = MAGIC_CONTEXT)]
    pub magic_context: AccountInfo<'info>,
    /// CHECK: pinned
    #[account(address = MAGIC_PROGRAM)]
    pub magic_program: AccountInfo<'info>,
}

#[account]
pub struct Campaign {
    pub brand: Pubkey,
    pub mint: Pubkey,
    pub offer_id: u64,
    pub category: u8,
    pub per_query_cost: u64,
    pub per_accept_payout: u64,
    // The brand's COMMITMENT to its target shade — the ONLY thing the agent can query her against (L2).
    // The plaintext shade + salt are NEVER stored on base; they are opened to her agent in-enclave and
    // verified against this hash. So even a SETTLED match reveals only an opaque hash, not the shade, and
    // the set of her matched shades can no longer be reconstructed from base.
    pub target_hash: [u8; 32],
    pub escrowed: u64,
    pub spent: u64,
    pub paid: u64,
    pub queries: u32,
    pub accepts: u32,
    pub active: bool,
    pub bump: u8,
    // Match state written IN-ENCLAVE and committed to base on undelegate.
    pub answered: bool,            // idempotency (L1): a repeat query of this offer is a free no-op
    pub receipt: [u8; 32],         // sha256(target_hash‖verdict‖nonce) — opaque; the verdict is NOT recoverable without the private nonce (L5)
    pub payee_commit: [u8; 32],    // H(her wallet‖nonce) — set ONLY on a match (zeros otherwise). Her wallet is unlinkable until she settles (L5)
}
impl Campaign {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1 + 8 + 8 + 32 + 8 + 8 + 8 + 4 + 4 + 1 + 1 + 1 + 32 + 32;
}

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub brand: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(init, payer = brand, space = Campaign::SPACE, seeds = [CAMPAIGN_SEED, brand.key().as_ref(), &offer_id.to_le_bytes()], bump)]
    pub campaign: Account<'info, Campaign>,
    #[account(init, payer = brand, token::mint = mint, token::authority = campaign, seeds = [ESCROW_SEED, campaign.key().as_ref()], bump)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut, constraint = brand_token.owner == brand.key() @ OiraError::BadTokenOwner, constraint = brand_token.mint == mint.key() @ OiraError::BadMint)]
    pub brand_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SettleOffer<'info> {
    pub brand: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_SEED, brand.key().as_ref(), &campaign.offer_id.to_le_bytes()], bump = campaign.bump, has_one = brand)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [ESCROW_SEED, campaign.key().as_ref()], bump)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut)]
    pub her_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseCampaign<'info> {
    #[account(mut)]
    pub brand: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_SEED, brand.key().as_ref(), &campaign.offer_id.to_le_bytes()], bump = campaign.bump, has_one = brand, close = brand)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [ESCROW_SEED, campaign.key().as_ref()], bump)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut)]
    pub brand_token: Account<'info, TokenAccount>,
    #[account(mut, token::mint = escrow.mint, token::authority = TREASURY)]
    pub treasury_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum OiraError {
    #[msg("encrypted traits too long")] EncTooLong,
    #[msg("encrypted traits empty")] EncEmpty,
    #[msg("palette is not marked private")] NotPrivate,
    #[msg("traits are not sealed")] TraitsNotSealed,
    #[msg("bad trait bucket value")] BadTrait,
    #[msg("sealed traits do not match the published commitment")] BindingMismatch,
    #[msg("traits owner mismatch")] TraitsOwnerMismatch,
    #[msg("stale epoch")] StaleEpoch,
    #[msg("query budget exceeded for this epoch")] QueryBudgetExceeded,
    #[msg("lifetime query budget exceeded")] LifetimeBudgetExceeded,
    #[msg("per-brand distinct-offer cap exceeded")] PerBrandCapExceeded,
    #[msg("offer does not match this campaign target")] OfferMismatch,
    #[msg("verdict is not a match")] NotAMatch,
    #[msg("caller is not her authorized agent")] UnauthorizedAgent,
    #[msg("offer already settled")] AlreadySettled,
    #[msg("offer has not been answered in-enclave")] NotAnswered,
    #[msg("match receipt does not verify")] ReceiptMismatch,
    #[msg("payee does not own the palette")] PayeeMismatch,
    #[msg("escrow smaller than one payout")] EscrowTooSmall,
    #[msg("campaign is closed")] CampaignClosed,
    #[msg("insufficient escrow for this settlement")] InsufficientEscrow,
    #[msg("brand token account owner mismatch")] BadTokenOwner,
    #[msg("brand token account mint mismatch")] BadMint,
    #[msg("not allowed to commit this account")] NotAllowedToCommit,
}
