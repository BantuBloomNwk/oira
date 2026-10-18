# Spike B: uncommitted ER state at teardown (VERDICT: bucket, don't rely on never-commit)

Question (Fable Attack 4): can uncommitted ER plaintext leak to public base at teardown /
validator rotation / periodic commit?

## Finding (MagicBlock docs)
- The ER operator **periodically commits** ephemeral state to base **optimistically**
  (fraud-proof challengeable), and **undelegation finalizes** and syncs the account to L1.
- So a delegated account's contents CAN reach base: not only on an explicit undelegate, but
  via the operator's periodic commit. "Never committed" is not an absolute account-level
  guarantee; it depends on the delegation's commit-frequency config and operator behaviour.
- Observed in `per-palette-e2e`: during the 8 in-ER matches base stayed frozen (query_count=0)
  and only reflected query_count=8 after explicit undelegate, i.e. auto-commit was not pushing
  mid-session there, but this is config/behaviour dependent, not a guarantee.

## Conclusion (design)
Do NOT rely on the traits account never reaching base. Instead:
1. **Bucket the traits** (quantized categories: undertone∈{warm,neutral,cool,olive},
   depth∈Monk 1-10, season∈12). Any periodic/teardown commit then leaks only categories,
   never a biometric-grade vector. This is now MANDATORY, not optional.
2. Configure the traits-account delegation with a long/disabled commit frequency and never
   explicitly undelegate it (let it drop); keep the base-committable RECEIPT in a separate
   account with only hashed/private data.
3. If ER state is dropped at teardown, she simply re-seals (availability cost, acceptable).

Net: bucketing makes the outcome safe whether uncommitted state is dropped or force-committed.
