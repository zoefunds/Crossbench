# StudioNet test-escrow recovery inventory

Checked on-chain on 2026-10-08 after the first deadline recoveries. These are test-only
stakes owned by the documented deterministic integration identities. They are
not production user funds.

| Contract | Dispute | Status | Escrow | Earliest next action |
|---|---|---:|---:|---|
| `0x0d68f263f9A3c060F1b91430071B37F515A0Bb4A` | `ec-1` | `SETTLED` | 0 GEN | finalized `2026-10-08T22:37:33Z`; both credits withdrawn |
| `0x0d68f263f9A3c060F1b91430071B37F515A0Bb4A` | `ec-3` | `SETTLED` | 0 GEN | finalized `2026-10-08T22:38:24Z`; both credits withdrawn |
| `0xc7D4fEAA1DF3394298978bA05754e9Aa515822E2` | `ec-1` | `EVIDENCE_SUBMISSION` | 0.1 GEN | evidence deadline `2026-10-10T07:15:08Z`; failed consensus counter did not persist |
| `0xAd57B8E1A364bdbAf18acCf0149c0fB290ef8Ad1` | `ec-1` | `EVIDENCE_SUBMISSION` | 0.1 GEN | evidence deadline `2026-10-10T07:23:27Z`; failed consensus counter did not persist |
| `0xE18e7F3D63B54dFb71D5AFD6c3269Fd9510577F6` | `ec-1` | `PRELIMINARY_VERDICT` | 0.1 GEN | finalize after `2026-10-09T07:34:50Z`, then withdraw both credits |
| `0x5904faF3215cC2B0664adf5Fa0a8f0C000e5BAF6` | `ec-1` | `PRELIMINARY_VERDICT` | 0.1 GEN | finalize after `2026-10-09T08:13:12Z`, then withdraw both credits |
| `0x2352A0cBF175F1e69eBc8364A35301570378FF22` | `ec-1` | `PRELIMINARY_VERDICT` | 0.1 GEN | current production; finalize after `2026-10-09T09:21:10Z`, then withdraw both credits |

The remaining current and former-production preliminary verdicts can be recovered with
`test_resume_recorded_live_lifecycle_after_challenge_expiry`. The two
intermediate contracts exposed a StudioNet limitation: failed outer validator
consensus does not commit the contract's attempted failure counter, so their
`resolve_stalled_dispute` threshold cannot currently be reached. Do not claim
those 0.2 GEN as recoverable unless GenLayer provides a transaction-level
recovery or changes failed-consensus state semantics.

Production 0.3.1 catches inner consensus exceptions in direct-VM tests, but its
first real post-cutover assessment still left `eval_attempts=0`, showing that an
outer StudioNet consensus failure bypasses the contract catch. It does not yet
provide a network-reliable recovery threshold. All stakes remain attached to
their immutable deployment addresses.

Recovery proof for `0x0d68...`: the idempotent deadline integration completed
both disputes without repeating a payable setup write (`3 passed, 3 skipped`).
Post-write reads show both disputes `SETTLED`, zero per-dispute deposited stake,
zero contract escrow, zero claimable credit, `0.25 GEN` total withdrawn
(including the earlier cancelled-dispute refund), and balanced accounting.

Always re-read each dispute and credit before broadcasting a write. Never
repeat a payable setup transaction during recovery.
