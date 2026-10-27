# Ghost Town

**A shielded social deduction game on Zcash.** Mafia, where your role card is a shielded memo, nobody can fake a role claim, and the pot pays out in ZEC.

**Play:** https://ghosttown.nerom.site. A practice table against bots takes about four minutes, and you need no wallet.

Somebody in this town is leaking. Each night the **Leakers** dox one ghost. The **Auditor** checks one ghost's viewing key. The **Shielder** shields one ghost from the dox. By day the town argues, claims roles, and votes on a shielded ballot. The **Glitch** wins by getting voted out.

## Why it needs Zcash

Mafia is a game of secrets. Zcash is a system for them. Each mechanic below is a real shielded-transaction property, not a coat of paint.

| In the game | On Zcash |
| --- | --- |
| **Buy in** | Each player pays the stake to the table's shielded address. The memo is `ghosttown:<table>:join:<seat>:<name>`. Outsiders cannot see who is playing. |
| **The deal** | The narrator's wallet pays each player 0.0001 ZEC whose **encrypted memo is their role card**. Only that player's wallet can read it. It is one multi-recipient ZIP 321 request, so the whole deal is one transaction. The app also offers one QR per seat for wallets that do not take multi-recipient requests. |
| **No cheating narrator** | Every card carries the **deal commitment**: SHA-256 over seats, names, roles and a salt. Each player holds it in their wallet before night one. At the end the salt is revealed and every browser re-hashes the deal. |
| **Proof of role** | Claims are cheap; proof is not. A player proves their role by pasting a **chit**, a single-output disclosure, for their role-card output, made in their own browser at [chit.nerom.site](https://chit.nerom.site). Every browser at the table verifies it against the deal transaction with the official Zcash crates (`orchard`, `zcash_note_encryption`), compiled to WebAssembly. A Leaker can say "I am the Auditor" but can never prove it. |
| **Shielded ballot** | Only the tally is published. Who voted for whom never is. |
| **The pot** | The winners split the stakes in one ZIP 321 payout from the table wallet. It can be published as a Chit payout ledger anyone can audit. |

## Two ways to play

- **Practice table** (`#/practice`): you against 4–7 bots, in your tab.
  - The bots claim, accuse and lie. Leaker bots fake an Auditor claim and frame a Citizen. A real Auditor bot proves its card when it finds a Leaker.
  - Your role card and its proof use the **specimen deal**: a real, fully proven v6 Ironwood transaction with five role-card outputs. It is funded from nothing, so it is **not on chain**, and it is always labelled specimen. The proof you see is a real cryptographic verification.
- **Staked table** (`#/host`): friends on phones, real ZEC.
  1. **Open a table.** The host's browser is the narrator.
  2. **Join and buy in.** Friends join with an invite link and buy in from Zodl with a ZIP 321 QR. The host's tab can confirm buy-ins on chain with the host's viewing key, which stays in that tab.
  3. **Deal.** The host deals with one QR, and every player's card arrives in their wallet.
  4. **Play.** Moves travel through a relay, end-to-end encrypted. Empty seats are filled by bots.

## Architecture

```
web/            Vite + TypeScript, no framework, strict CSP
  engine.ts     the game: deal + commitment, nights, shielded ballot, win checks, bots, per-seat views
  runner.ts     plays bots on a human clock and resolves phases (practice tables and staked hosts)
  zec.ts        role-card memos, ZIP 321 builders, Blockchair fetch, proof of role (chit-zcash WASM)
  net.ts        X25519 + XChaCha20-Poly1305 sealing; relay client
  staked.ts     host lobby, deal, narrator, guest, payout
  table.ts      the table UI, rendered from a View (what one seat may know)
relay/          ~90 lines of Node `ws`: routes opaque ciphertext by room code, stores nothing
specimen/       Rust tool that builds the specimen deal transaction and its chits (uses chit-core)
```

- **Per-seat views.** The narrator never sends the whole game to anyone. `viewFor(game, seat)` gives each seat only:
  - its own role;
  - a Leaker's partners;
  - the Auditor's own notebook;
  - the roles that are public: exposed, proven, or revealed at the end.
- **Encrypted transport.**
  - Each guest's tab makes an X25519 key, and the host's public key is in the invite link.
  - Every message is sealed with XChaCha20-Poly1305 under `SHA-256(shared secret ‖ table code)`.
  - The relay sees room codes, sizes and timing. It never sees roles, moves, chat, addresses or votes.
- **Determinism.** The deal and every tie-break come from a seed, so the outcome can be replayed. The commitment binds the deal.
- **Tests:**
  - **Engine:** role counts; the commitment and its tamper checks; shields; ballots; 1,500 complete bot-only games at 5–10 seats, each ending with a winner and a valid deal, with neither side dominating.
  - **Zcash layer:** role cards fit a 512-byte memo and parse back exactly, and ZIP 321 requests are built correctly, both single and multi-recipient.

```
cd web && npm install && npm test && npm run dev
```

## What is real and what is not

- **Real:**
  - the game engine, bots, and the encrypted multiplayer over the live relay;
  - role-card memos, ZIP 321 requests (buy-in, deal, payout), and on-chain buy-in checks with a viewing key;
  - proof-of-role verification with the official Zcash crates.
- **Specimen:**
  - The practice table's deal transaction is real and fully proven, but it is not on chain. It is labelled everywhere.
- **Trusted:**
  - The narrator (the host's browser) knows every role, like a human narrator in Mafia.
  - The commitment proves the narrator never changed the deal. It does not stop the narrator from peeking, so play with a host you trust, or a host who sits out.
- **Not built:**
  - Automatic payout signing. The host scans one ZIP 321 request.
  - Night actions as on-chain memos. Moves go through the relay for speed. The commitment and proofs are what bind the game to the chain.

Built for ZECATHON (Wildcard). Proofs by [chit-zcash](https://github.com/neromtoobad/chit). Characters: original pixel "shielded identities" in the zkSNARKs style.

MIT OR Apache-2.0.
