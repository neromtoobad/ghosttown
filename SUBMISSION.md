# ZECATHON submission: Ghost Town (for the teammate's account)

Submitted from the teammate's own account (rule 01: "One person registers and submits. The prize goes to that account; build with anyone."). Rule 04 allows one submission per account, so this cannot come from @neromtoobad, which entered Chit.

## Project name

```
Ghost Town: a shielded social deduction game
```

## Track

WILDCARD

## Description (1985 / 2000)

```
Mafia is a game of secrets. Zcash is a system for them. Ghost Town is a social deduction game where every secret is a shielded transaction.

Somebody in town is leaking. Each night the Leakers dox one ghost, the Auditor checks one ghost's viewing key, and the Shielder shields one. By day the town argues, claims roles and votes. The Glitch wins by getting voted out.

What Zcash does:
- Buy-in: each player pays the stake to the table's shielded address via a ZIP 321 QR from Zodl. Outsiders can't see who's playing.
- The deal: one multi-recipient ZIP 321 request pays every player 0.0001 ZEC whose encrypted memo is their role card. Only your wallet can read yours.
- No cheating narrator: every card carries a SHA-256 commitment to the whole deal; at the end the salt is revealed and every browser re-checks it.
- Proof of role: claims are cheap, proof is not. Paste a chit (single-output disclosure) for your card and every browser verifies it against the deal tx with the official Zcash crates in WASM. A Leaker can claim to be the Auditor but can never prove it.
- Shielded ballot: only tallies are published.
- The pot: winners split the stakes in one ZIP 321 payout.

Built: deterministic engine (1,500 bot-vs-bot games in tests), lying/accusing bots, practice table, staked multiplayer: host's browser narrates; moves are X25519 + XChaCha20-Poly1305 sealed through a relay that only sees ciphertext; each seat gets only its own view. Original pixel "shielded identity" characters.

Real: engine, bots, encrypted live multiplayer, role-card memos, ZIP 321 buy-in/deal/payout requests, on-chain buy-in checks with a viewing key, proof verification.
Specimen: the practice table's deal tx is real and fully proven but funded from nothing, so not on chain; always labelled.
Trust: the host's browser knows all roles (like a human narrator); the commitment proves the deal was not changed, not that the host didn't peek.
Not built: night moves as on-chain memos (relay for speed).
```

## Code repository

https://github.com/neromtoobad/ghosttown (private for now; make it public before Oct 28, 23:59 UTC)

## Working demo

https://ghosttown.nerom.site

## Demo video

To do.
