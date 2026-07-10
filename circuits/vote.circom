pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

template Vote() {
    signal input trapdoor;
    signal input nullifier_seed;
    signal input weight_a;
    signal input weight_b;
    signal input merkle_path[20];
    signal input path_indices[20];

    signal input root;
    signal input nullifier_hash;
    signal input war_id;
    signal input side;
    signal input weight;

    // DOMAIN_VOTE — domain separator for the vote nullifier.
    // ASCII "VOTE" = 0x56 0x4F 0x54 0x45 = 0x564F5445 = 1448039493.
    // Prevents cross-context replay: vote nullifier = Poseidon(seed, war_id, VOTE)
    // is cryptographically unlinkable to medal nullifier = Poseidon(seed, war_id, MEDAL).
    var DOMAIN_VOTE = 1448039493;

    // 1. inner = Poseidon(nullifier_seed, trapdoor)
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

    // 3. Merkle tree verification (depth 20, Poseidon(2) per level)
    //    path_indices[i] == 0  →  hash = Poseidon(current, sibling)
    //    path_indices[i] == 1  →  hash = Poseidon(sibling, current)
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

    // 4. nullifier_hash = Poseidon(nullifier_seed, war_id, DOMAIN_VOTE)
    component nullifier_poseidon = Poseidon(3);
    nullifier_poseidon.inputs[0] <== nullifier_seed;
    nullifier_poseidon.inputs[1] <== war_id;
    nullifier_poseidon.inputs[2] <== DOMAIN_VOTE;
    nullifier_hash === nullifier_poseidon.out;

    // 5. side ∈ {0,1}
    side * (side - 1) === 0;

    // 6. weight = (side == 0) ? weight_a : weight_b
    component weight_mux = Mux1();
    weight_mux.c[0] <== weight_a;
    weight_mux.c[1] <== weight_b;
    weight_mux.s <== side;
    weight === weight_mux.out;

    // 7. weight ∈ {1,2,3}
    signal prod_12 <== (weight - 1) * (weight - 2);
    prod_12 * (weight - 3) === 0;
}

component main { public [ root, nullifier_hash, war_id, side, weight ] } = Vote();
