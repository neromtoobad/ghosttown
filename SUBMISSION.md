# ZECATHON submission: Glasstown + Ghost Town ("Two Towns")

**Which account submits it is still open.** Rule 04 allows one submission per account, and @neromtoobad entered Chit. Submit this from an account that has no other entry.

## Project name (64 max)

```
Ghost Town: shielded Mafia on Zcash, with Glasstown as way in
```

## Track

WILDCARD

## Description (2000 max)

```
Two towns, one river. In Glasstown every wallet is glass: the Watcher reads your job, home and name from public payments. Across the river is Ghost Town, where everyone is shielded and he can't see in, so he sends Leakers. Ghost Town is Mafia where every secret is a shielded transaction.

Glasstown (the way in, 3 min): tap a glass wallet and watch the Watcher learn you; tap a shielded one and he learns nothing; play Dark Pool, carrying coins into the shielded pool past his drones; cross the river. The pixel identity you earn becomes your ghost at the table.

Ghost Town:
- The deal: one multi-recipient ZIP 321 request pays every player 0.0001 ZEC; each encrypted memo is a role card. Only your wallet reads yours.
- No cheating narrator: every card carries a SHA-256 commitment to the deal; at the end the salt is revealed and every browser re-checks it.
- Proof of role: claims are cheap. A chit (single-output disclosure) for your card is verified against the deal tx with the official Zcash crates in WASM. A Leaker can claim Auditor, never prove it.
- The Shielder's night is a round of Dark Pool. Get caught and the shield cracks.
- Shielded ballots (tallies only), ZIP 321 buy-in and payout.
- Glass Gallery: a real mainnet deal seen from Glasstown (sealed actions, raw bytes) beside the cards opened with chits. The rest stay dark.

Real, on Zcash mainnet: table EAS24 was dealt Oct 28 in tx d3433a76…8c57 (2 cards, 1 tx); its Auditor proved her card live. See ghosttown.nerom.site/#/gallery
Also real: engine (bot-vs-bot tests), bots, encrypted multiplayer (X25519 + XChaCha20 via a ciphertext-only relay), proof checks.
Specimen: the practice table's deal is a proven tx funded from nothing, so not on chain; always labelled.
Trust: the host's browser knows all roles, like a human narrator; the commitment proves the deal was not changed.
```

## Code repository

```
https://github.com/neromtoobad/ghosttown
```

Public since Oct 28. Tick the "public by the deadline" box.

## Working demo

```
https://ghosttown.nerom.site
```

Glasstown, the way in: https://ghosttown.nerom.site/glasstown

## Demo video

`zecathon/ghosttown-video.mp4`: a music video set to an original song, "Ghost Town". Upload it to YouTube, then paste the link.

## Before pressing SUBMIT

- [ ] Decide the account (not @neromtoobad, which holds Chit).
- [ ] Video uploaded, link pasted.
- [ ] SAVE DRAFT first, then SUBMIT.
