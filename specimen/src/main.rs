//! Builds the practice table's *specimen deal*: one fully proven and signed v6 transaction whose
//! Ironwood bundle deals five role cards, one encrypted memo per seat. It is funded from nothing,
//! so it is not and never will be on chain. Practice tables use it to show a real proof of role:
//! a chit for one card, verified with the official Zcash crates. Keys are throwaway.
//!
//!     CARGO_TARGET_DIR=../../chit/target cargo run --release

use orchard::{
    builder::{Builder, BundleType},
    bundle::BundleVersion,
    circuit::ProvingKey,
    keys::{FullViewingKey, Scope, SpendingKey},
    tree::Anchor,
    value::NoteValue,
};
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_primitives::transaction::TransactionData;
use zcash_protocol::consensus::{BlockHeight, BranchId, Network, NetworkType};

fn memo(text: &str) -> [u8; 512] {
    assert!(text.len() <= 512, "memo too long");
    let mut m = [0u8; 512];
    m[..text.len()].copy_from_slice(text.as_bytes());
    m
}

const CARDS: [(&str, u8, &str); 5] = [
    ("leaker", 0x21, "THE LEAKER. Each night, choose one ghost to dox. Win when Leakers equal everyone else."),
    ("auditor", 0x22, "THE AUDITOR. Each night, check one ghost's viewing key: Leaker or not."),
    ("shielder", 0x23, "THE SHIELDER. Each night, shield one ghost from the dox. Never the same ghost twice."),
    ("glitch", 0x24, "THE GLITCH. You win if the town votes you out."),
    ("citizen", 0x25, "A CITIZEN. Find the Leakers and vote them out."),
];

fn main() {
    let mut rng = rand::rng();
    let fvk = |b: u8| FullViewingKey::from(&SpendingKey::from_bytes([b; 32]).unwrap());
    let narrator = fvk(0x6e);
    let version = BundleVersion::ironwood_v3();
    let mut b = Builder::new(BundleType::DEFAULT, version, version.default_flags(), Anchor::empty_tree()).unwrap();
    for (_, seed, text) in CARDS {
        b.add_output(
            Some(narrator.to_ovk(Scope::External)),
            fvk(seed).address_at(0u32, Scope::External),
            NoteValue::from_raw(10_000), // 0.0001 ZEC of dust carries each card
            memo(&format!("GHOST TOWN · role card\nYou are {text}\ndeal: specimen · practice table\nghosttown.nerom.site")),
        )
        .unwrap();
    }
    let (bundle, _) = b.build::<i64>(&mut rng).unwrap().unwrap();
    eprintln!("building proving key…");
    let pk = ProvingKey::build(bundle.circuit_version());
    let bundle = bundle
        .create_proof(&pk, &mut rng)
        .unwrap()
        .apply_signatures(&mut rng, [0u8; 32], &[])
        .unwrap()
        .try_map_value_balance(|v: i64| zcash_protocol::value::ZatBalance::from_i64(v))
        .unwrap();
    let tx = TransactionData::from_parts_v6(BranchId::Nu6_3, 0, BlockHeight::from_u32(3_533_000), None, None, None, Some(bundle))
        .freeze()
        .unwrap();
    let mut bytes = Vec::new();
    tx.write(&mut bytes).unwrap();

    // One payee chit per card, made from each seat's own viewing key: what a player would paste.
    let mut cards = Vec::new();
    for (role, seed, _) in CARDS {
        let ufvk = UnifiedFullViewingKey::new(None, Some(fvk(seed))).unwrap().encode(&Network::MainNetwork).unwrap();
        let found = chit_core::scan(&tx, &ufvk, NetworkType::Main).unwrap();
        let chit = &found.iter().find(|f| !f.change).expect("each seat sees its card").disclosure;
        cards.push(format!("    \"{role}\": \"{chit}\""));
    }
    let out = concat!(env!("CARGO_MANIFEST_DIR"), "/../web/public/specimen-deal.json");
    std::fs::write(
        out,
        format!(
            "{{\n  \"note\": \"SPECIMEN. A real, proven v6 Ironwood transaction funded from nothing: it is not on chain. Keys are throwaway.\",\n  \"txid\": \"{}\",\n  \"tx\": \"{}\",\n  \"cards\": {{\n{}\n  }}\n}}\n",
            tx.txid(),
            hex::encode(&bytes),
            cards.join(",\n")
        ),
    )
    .unwrap();
    println!("{} · {} role cards", tx.txid(), cards.len());
}
