pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

// Medal circuit — SECOND proof for anonymous medal claim (SPEC §3.2, circuit 2).
// Proves the SAME census membership as the vote (same leaf) but emits a nullifier under
// a DIFFERENT domain, so the medal claim is cryptographically unlinkable to the vote.
// It deliberately does NOT expose side/weight: the medal must not reveal which side you
// backed. Public: root, medal_nullifier_hash, war_id.
template Medal() {
    signal input trapdoor;
    signal input nullifier_seed;
    signal input weight_a;
    signal input weight_b;
    signal input merkle_path[20];
    signal input path_indices[20];

    signal input root;
    signal input medal_nullifier_hash;
    signal input war_id;

    // DOMAIN_MEDAL — domain separator for the medal nullifier.
    // ASCII "MEDL" = 0x4D 0x45 0x44 0x4C = 0x4D45444C = 1296385100.
    // MUST differ from DOMAIN_VOTE (1448039493) so medal nullifier =
    // Poseidon(seed, war_id, MEDAL) is unlinkable to vote nullifier =
    // Poseidon(seed, war_id, VOTE). (INV: DOMAIN_MEDAL != DOMAIN_VOTE.)
    var DOMAIN_MEDAL = 1296385100;

    // 1. inner = Poseidon(nullifier_seed, trapdoor)   — identical leaf construction to vote
    component inner_hash = Poseidon(2);
    inner_hash.inputs[0] <== nullifier_seed;
    inner_hash.inputs[1] <== trapdoor;
    signal inner;
    inner <== inner_hash.out;

    // 2. leaf = Poseidon(inner, weight_a, weight_b)
    component leaf_hash = Poseidon(3);
    leaf_hash.inputs[0] <== inner;
    leaf_hash.inputs[1] <== weight_a;
    leaf_hash.inputs[2] <== weight_b;
    signal leaf;
    leaf <== leaf_hash.out;

    // 3. Merkle tree verification (depth 20, Poseidon(2) per level) — same census tree
    signal level[21];
    level[0] <== leaf;

    component left_mux[20];
    component right_mux[20];
    component level_hash[20];

    for (var i = 0; i < 20; i++) {
        path_indices[i] * (path_indices[i] - 1) === 0;

        left_mux[i] = Mux1();
        left_mux[i].c[0] <== level[i];
        left_mux[i].c[1] <== merkle_path[i];
        left_mux[i].s <== path_indices[i];

        right_mux[i] = Mux1();
        right_mux[i].c[0] <== merkle_path[i];
        right_mux[i].c[1] <== level[i];
        right_mux[i].s <== path_indices[i];

        level_hash[i] = Poseidon(2);
        level_hash[i].inputs[0] <== left_mux[i].out;
        level_hash[i].inputs[1] <== right_mux[i].out;

        level[i+1] <== level_hash[i].out;
    }

    root === level[20];

    // 4. medal_nullifier_hash = Poseidon(nullifier_seed, war_id, DOMAIN_MEDAL)
    component nullifier_poseidon = Poseidon(3);
    nullifier_poseidon.inputs[0] <== nullifier_seed;
    nullifier_poseidon.inputs[1] <== war_id;
    nullifier_poseidon.inputs[2] <== DOMAIN_MEDAL;
    medal_nullifier_hash === nullifier_poseidon.out;
}

component main { public [ root, medal_nullifier_hash, war_id ] } = Medal();
