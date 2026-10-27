# Ghost Town: a shielded social deduction game

ZECATHON Wildcard entry. Submitted by a teammate's account, as rules 01 and 04 allow.

**One line:** Mafia/Werewolf where your role card is a shielded Zcash memo, nobody can fake a role claim, and the pot pays out in ZEC.

## Why it is a Zcash game, not a game with a Zcash logo

Mafia is a game about secrets, and Zcash is a system for secrets. Each mechanic is a real shielded-transaction property.

| Game moment | What Zcash does |
| --- | --- |
| **Buy in** | Each player pays a stake (e.g. 0.01 ZEC) to the table's shielded address. The memo `ghosttown:<table>:<seat>` claims a seat. Nobody outside learns who is playing. |
| **The deal** | The narrator's wallet sends each player a dust output whose encrypted memo is their role card. Only that player's wallet can read it. With a wallet that supports multi-recipient ZIP 321, the whole deal is one transaction. |
| **No cheating narrator** | Every role card carries the same deal commitment, `SHA-256(seats + roles + salt)`. Each player holds the commitment in their own wallet before night one. At the end the narrator reveals the salt and anyone re-checks the deal. |
| **Proof of role** | Mid-game, a player can prove their role. They paste a chit for their role-card output (selective disclosure, the Chit engine). Everyone's browser verifies it against the deal transaction. A Leaker can claim to be the Auditor but can never prove it. |
| **The pot** | The winning team splits the stakes. Payouts are one ZIP 321 request from the table wallet, published as a Chit payout ledger. |

## Roles (characters)

All roles are pixel "shielded identities" in the zkSNARKs style. A role's colour is shown only once that role is revealed.

| Role | Team | Night action | Win |
| --- | --- | --- | --- |
| **The Leakers** (1–2) | Leak | Choose one ghost to **dox** (expose) | Leakers ≥ everyone else alive |
| **The Auditor** | Town | Check one ghost's **viewing key**: learn whether they are a Leaker | All Leakers exposed |
| **The Shielder** | Town | **Shield** one ghost from tonight's dox (not the same ghost twice in a row) | All Leakers exposed |
| **The Glitch** (7+ players) | Alone | None | Gets voted out by the town (wins a share, game goes on) |
| **Citizens** | Town | None | All Leakers exposed |

## A round

1. **Night.**
   - Leakers agree on a target; on a tie, the deal seed breaks it.
   - The Shielder shields someone.
   - The Auditor checks someone.
2. **Morning.**
   - If the target was not shielded, they are **exposed**: their role is revealed and they are out.
   - Otherwise: "Someone tried to dox X. The shield held."
3. **Day.** Talk, accuse, and optionally **prove** a role.
4. **Vote.** Shielded ballot. Only the tally is public; who voted for whom never is. The top plurality is exposed; ties and skips mean nobody.
5. Repeat until a team wins. Then the reveal:
   - the commitment is checked;
   - every role is shown;
   - the pot is paid out.

## Tables

- **Practice table** (no ZEC, solo vs bots). A judge can play a full game in about 4 minutes.
  - Bots claim and accuse. Auditor bots announce checks, and Leaker bots lie.
  - The role-card memos and proofs run against a **specimen** deal transaction: a real, proven v6 transaction, not on chain, and labelled as such.
- **Staked table** (real ZEC, friends on phones).
  - The host's browser is the narrator, and a dumb relay only forwards encrypted messages:
    - X25519 + XChaCha20-Poly1305;
    - per-player keys made in each tab.
  - Joins, deal, proofs and payout run on mainnet through the players' own wallets (Zodl).

## Architecture

- `engine/`: pure TypeScript and deterministic.
  - The state machine, roles, resolution, win checks and bots.
  - The commitment, using a seeded RNG.
  - Unit-tested.
- `web/`: a Vite static app in the same CRT world as Chit, with its own identity. The scene is a night town of monitors, with "leak red" set against shield green.
  - Practice table, staked table (host or join), reveal screen.
  - ZIP 321 builders (join, deal, payout), QR codes.
  - Proof verification through `chit-zcash` (the Chit WASM library).
- `relay/`: about 80 lines of Node `ws`. It holds rooms and pipes ciphertext, sees no plaintext, stores nothing, and runs on Railway.
- **Art:** a Higgsfield pose sheet per role, a town key art, and a morning "exposed" card.

## Honesty

- The narrator (the host's browser) knows all roles, like a human narrator in Mafia. The commitment proves they did not change the deal. It does not stop them from peeking.
- The relay sees room traffic sizes and timing, never contents.
- Practice tables are labelled practice; the specimen deal transaction is labelled specimen.
