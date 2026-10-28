# Ghost Town

**A shielded town on Zcash, with Mafia at its heart.** Ghost Town is a rainy street of old TVs, and every screen is a door. Everyone here is shielded. The Watcher, who reads every public wallet across the river in Glasstown, can't see in, so he sends Leakers.

- **Play:** https://ghosttown.nerom.site (no wallet, no account)
- **Judges, start here:** https://ghosttown.nerom.site/#/tour. It runs ten live checks in about 90 seconds against a real deal on Zcash mainnet: four forgeries, all rejected.
- **Video:** https://youtu.be/4t8ewAmfA00 (1:46: a short film, then a UK drill track that walks through every door)

ZECATHON 2026 · Wildcard · MIT or Apache-2.0.

## The four judging questions

### 1. Privacy: what leaks?

| Who | Learns | Never learns |
| --- | --- | --- |
| The chain | One shielded transaction per deal; buy-ins and payouts as shielded payments | Who plays, any role, any amount, any memo |
| Other players | Your seat, your claims, and a role **only if you prove it** | Your wallet, other outputs, your viewing key |
| The narrator (host's browser) | Every role, like the human narrator in Mafia | Your viewing key |
| The relay | Room codes, message sizes and timing, and which deal txids are looked up | Roles, moves, chat, votes, addresses (all end-to-end sealed) |
| Block explorers, analytics, CDNs | **Nothing.** The page's CSP allows only itself and the relay. | |

- **No block explorer.** Transactions are read straight from Zcash lightwalletd (zec.rocks, NA and EU) through the relay's `/tx`. Every browser re-hashes the bytes to the txid it asked for, so not even the relay can swap a transaction.
- **Viewing keys never leave the tab.** Chits are made in the player's own browser.
- **Shielded ballots:** only totals are published.
- **The trust you take on:** the host's browser knows the deal (that's the narrator's job). The commitment on every card proves the narrator never *changed* it, but not that they didn't peek. Play with a host you trust, or let the host sit out.

### 2. Usefulness: would someone use this on Monday?

- **Players:** a party game you can host for friends tonight, with a real pot in ZEC and roles nobody can fake.
- **Newcomers:** Glasstown (the red TV) is a 3-minute walk through public vs shielded money, then Dark Pool and the river.
- **Builders:** the pieces are reusable for any hidden-role or sealed-information game:
  - a **shielded deal**: one multi-recipient ZIP 321 transaction, a secret per player in each encrypted memo;
  - a **deal commitment** on every card;
  - **proof of a secret** by single-output disclosure (chit).

### 3. Execution: what is real?

| Real, on Zcash mainnet | |
| --- | --- |
| Table **EAS24** | Dealt Oct 28 2026 in tx `d3433a762197fddb05589c2e5ad20d6624fec9f19889e1984a8205c8cfc68c57` (block 3,533,398): 2 role cards, 1 transaction. Its Auditor proved her card live. See `#/gallery` and `#/tour`. |

**Also real:**
- the game engine;
- lying bots;
- per-seat views;
- encrypted multiplayer through the relay;
- ZIP 321 buy-in, deal and payout requests;
- buy-in checks with the host's viewing key;
- proof checks with the official `orchard` and `zcash_note_encryption` crates (WASM, via chit-zcash).

**Specimen (always labelled):** the practice table's deal is a real, fully proven v6 Ironwood transaction funded from nothing, so it is not on chain.

**Simulated, and said so on the page:**
- Three Lanterns' coin;
- the Auditor's Desk ledger (a teaching puzzle, not real wallets);
- Glasstown's wallets.

**Tests:** `cd web && npx vitest run` runs **51 tests**.
- The mainnet deal hashes to its txid; both shown chits prove their seats.
- Five forgeries are rejected: wrong seat, wrong table, changed commitment, edited chit, replay.
- All five specimen cards prove.
- 1,500 bot-vs-bot games end with a valid deal.
- Per-seat secrecy: a Citizen sees only themself; Leakers see each other; only the Auditor reads the notebook.
- Cracked shields; win conditions.
- Lanterns: a lie never matches the commitment.
- The Desk: 300 random puzzles and a year of daily puzzles are all solvable; a day's puzzle is the same for everyone; the share text never gives away the answer.

### 4. Originality

- Role cards *are* shielded memos.
- "Claims are cheap, proof isn't" is enforced by Zcash disclosure: a Leaker can say "I'm the Auditor" but can never prove it.
- The Shielder's night is an arcade game, Dark Pool: carrying coins out of the glass and into the shielded pool.
- The Watcher's lie in Three Lanterns is caught by your own browser.
- None of it was ported from an earlier project. Glasstown, the side trip, began as our Oct 3 onboarding bounty entry and was rebuilt here as a district of the town.

## The town

| Door | What it is | Zcash idea |
| --- | --- | --- |
| **Séance Hall** | The table: practice against bots, or staked with friends | Shielded role cards, commitments, chit proofs, shielded ballots |
| **Staked Tables** | Host, invite, buy in from Zodl, deal in one transaction | ZIP 321, multi-recipient deal |
| **Three Lanterns** | A shell game; the Watcher commits first and sometimes lies | Commit, then reveal |
| **Auditor's Desk** | Three unlabelled viewing keys, eight sealed payments. A **daily** puzzle (the same for everyone each UTC day) with a shareable, spoiler-free result, plus endless practice | Viewing keys open only their own wallet; incoming notes hide the sender |
| **Arcade** | Dark Pool | Shielding: out of the glass, into the pool |
| **Glass Gallery** | The EAS24 deal from the glass side, beside the cards opened with chits | What the chain shows vs what a chit shows |
| **Ghost Radio** | The town anthem in three versions (UK drill, UK rap, Afrobeats), with the words in time and a visualiser; the ♪ in the header keeps it playing as you walk | |
| **Glasstown** | A 3-minute side trip across the river | Public vs shielded; your identity becomes your ghost |
| **Badges** | Nine marks on your ghost, earned around the town (prove a role, hold a shield, catch his lie, solve the daily…), kept only in your browser | |
| **Judges' tour** (`#/tour`) | Ten live checks, four forgeries | All of the above, in 90 seconds |

## How a staked table works
1. **Open a table.** The host opens it; their browser becomes the narrator.
2. **Join and buy in.** Friends join by invite link and buy in from Zodl (ZIP 321, memo `ghosttown:<table>:join:<seat>:<name>`). The host's tab can confirm buy-ins with the host's viewing key.
3. **Deal.** The host deals: one ZIP 321 request pays each player 0.0001 ZEC with their role card as the encrypted memo, and every card carries the deal commitment.
4. **Play.** Moves are sealed end to end (X25519 + XChaCha20-Poly1305) through a relay that sees only ciphertext.
5. **Prove a role.** Anyone can prove theirs: make a chit for their role-card output in their own browser and paste it. Every browser verifies it against the deal transaction.
6. **End.** The salt is revealed and every browser re-checks the commitment. The winners are paid with one ZIP 321 request.

## Layout

```
web/
  hub.ts         the street: every TV is a door
  engine.ts      deal + commitment, nights, Dark Pool shields, shielded ballot, wins, bots, per-seat views
  table.ts       the table UI; the Shielder's night is Dark Pool
  staked.ts      host lobby, deal, narrator, guest, payout
  zec.ts         role-card memos, ZIP 321, transactions from the relay (lightwalletd), proof of role
  tour.ts        the judges' tour
  gallery.ts     Glass Gallery
  lanterns.ts    Three Lanterns
  desk.ts        Auditor's Desk
  door.ts        Glasstown (glasstown.html), with glass/ (the Glasstown modules)
relay/
  server.js      routes sealed messages by room; GET /tx
  lwd.js         lightwalletd gRPC, three servers, no explorer, no logs
specimen/        Rust tool that builds the practice deal and its chits (chit-core)
```

```bash
cd web && npm i && npx vitest run && npm run dev      # http://localhost:5300
cd relay && npm i && npm start                          # :8080
```

## Not built
- **Automatic payout signing:** the host scans one ZIP 321 request.
- **Night actions as on-chain memos:** moves go through the relay for speed. The deal, the commitment and the proofs are what bind the game to the chain.
- **A narrator who can't peek:** that would need mental-poker-style dealing.

Proofs by [chit-zcash](https://github.com/neromtoobad/chit). Characters are original pixel "shielded identities". The short film in the video was generated from the game's own art.
