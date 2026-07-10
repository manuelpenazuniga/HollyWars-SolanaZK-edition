/**
 * serialize.ts — SPIKE T5: snarkjs proof → groth16-solana byte format
 *
 * DELIVERABLE CLAVE. Reusable por T3/T5a.
 *
 * Este script convierte proof.json + public.json generados por snarkjs
 * al formato de bytes que espera `groth16-solana` (Light Protocol) en
 * un programa Solana/SBF.
 *
 * La verificación on-chain usa los syscalls alt_bn128 (bn254 pairing)
 * que esperan coordenadas en BIG-ENDIAN (network byte order).
 * snarkjs exporta los field elements como strings decimales en proof.json.
 *
 * --- GOTCHAS DE SERIALIZACIÓN (leer antes de tocar) ---
 *
 * 1. NEGACIÓN DEL PUNTO A (pi_a):
 *    snarkjs entrega pi_a = (x, y) como punto en G1.
 *    groth16-solana espera -pi_a (el punto negado en el subgrupo).
 *    La negación en BN254/G1 es: (x, -y mod p) donde p es el primo
 *    del campo base Fq. La negación se hace CLIENT-SIDE porque el
 *    runtime SBF NO tiene arkworks (solo syscalls de pairing).
 *    Implementamos la negación calculando p - y (big-endian).
 *
 * 2. ENDIANNESS:
 *    Los syscalls alt_bn128 de Solana esperan coordenadas en BIG-ENDIAN.
 *    snarkjs exporta field elements como strings decimales.
 *    Convertimos decimal string → Buffer 32 bytes big-endian.
 *    NO hay que hacer swap de endianness adicional porque ya escribimos
 *    en big-endian. El `change_endianness` del test de groth16-solana
 *    convierte de big-endian (proof) a little-endian (arkworks) y
 *    viceversa — nosotros nos saltamos arkworks y vamos directo a big-endian.
 *
 * 3. ORDEN DE PUBLIC INPUTS:
 *    snarkjs public.json: array de strings decimales en el orden de
 *    declaración del circuito (el primer public signal primero).
 *    groth16-solana: array de [u8; 32] en el MISMO orden.
 *    Cada public input se serializa como 32 bytes big-endian.
 *
 * 4. FORMATO DE pi_b (G2):
 *    snarkjs proof.json: pi_b = [[x_c0, x_c1], [y_c0, y_c1], ["1","0"]]
 *    groth16-solana espera: [x_c0, x_c1, y_c0, y_c1] concatenados,
 *    cada uno 32 bytes big-endian, total 128 bytes.
 *    La coordenada Z (projective, siempre "1") se DROPpea.
 *
 * 5. FORMATO DE pi_a y pi_c (G1):
 *    snarkjs: [x, y, "1"]
 *    groth16-solana: [x, y] concatenados, cada uno 32 bytes big-endian,
 *    total 64 bytes. La coordenada Z se DROPpea.
 *
 * --- REFERENCIAS ---
 * groth16-solana v0.2.0: https://docs.rs/groth16-solana/0.2.0/
 * BN254 Fq modulus: 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
 */

const { unstringifyBigInts, leInt2Buff } = require('ffjavascript').utils;
const fs = require('fs');

/** BN254 field prime (Fq) — usado para negación de G1 */
const BN254_FQ = BigInt('0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47');

/**
 * Convierte un string decimal (snarkjs field element) a Buffer de `len`
 * bytes en big-endian.
 */
function bnToBufferBe(val, len = 32) {
    const le = leInt2Buff(unstringifyBigInts(val), len); // little-endian from snarkjs
    return Buffer.from(le).reverse();                     // flip to big-endian
}

/**
 * Negación de un punto G1 en coordenadas afines.
 * Dado (x, y) ambos como Buffer de 32 bytes big-endian,
 * retorna (x, p - y mod p).
 */
function negateG1(xBuf, yBuf) {
    const y = BigInt('0x' + yBuf.toString('hex'));
    const negY = BN254_FQ - y;
    const negYHex = negY.toString(16).padStart(64, '0');
    return {
        x: xBuf,
        y: Buffer.from(negYHex, 'hex'),
    };
}

/**
 * Convierte proof.json de snarkjs al formato PROOF de 256 bytes
 * que espera groth16-solana:
 *
 *   PROOF[0..64]   = -pi_a (negado): [x, y] big-endian 32+32 bytes
 *   PROOF[64..192] = pi_b: [x_c0, x_c1, y_c0, y_c1] big-endian 32*4 bytes
 *   PROOF[192..256] = pi_c: [x, y] big-endian 32+32 bytes
 *
 * La NEGACIÓN de pi_a es el paso más traicionero (ver GOTCHA #1 arriba).
 */
function serializeProof(proofJson) {
    const proof = JSON.parse(fs.readFileSync(proofJson));

    // --- pi_a (G1): negar y serializar ---
    const pi_a_x = bnToBufferBe(proof.pi_a[0]); // 32 bytes BE
    const pi_a_y = bnToBufferBe(proof.pi_a[1]); // 32 bytes BE

    // NEGACIÓN: groth16-solana espera -A, no A
    const neg_a = negateG1(pi_a_x, pi_a_y);
    const proof_a = Buffer.concat([neg_a.x, neg_a.y]); // 64 bytes BE

    // --- pi_b (G2): SWAP de Fp2 (imaginario primero) ---
    // pi_b = [[x_c0, x_c1], [y_c0, y_c1], ["1","0"]]
    // El syscall alt_bn128 (convención Ethereum) espera x_c1,x_c0,y_c1,y_c0.
    // DEBE coincidir con gen_vkey.js (la vkey usa el mismo swap). Sin esto,
    // off-chain verifica pero on-chain rechaza la proof válida.
    const pi_b_x_c0 = bnToBufferBe(proof.pi_b[0][0]);
    const pi_b_x_c1 = bnToBufferBe(proof.pi_b[0][1]);
    const pi_b_y_c0 = bnToBufferBe(proof.pi_b[1][0]);
    const pi_b_y_c1 = bnToBufferBe(proof.pi_b[1][1]);
    const proof_b = Buffer.concat([pi_b_x_c1, pi_b_x_c0, pi_b_y_c1, pi_b_y_c0]); // 128 bytes BE, Fp2 swapped

    // --- pi_c (G1): serializar directamente (NO se niega) ---
    const pi_c_x = bnToBufferBe(proof.pi_c[0]);
    const pi_c_y = bnToBufferBe(proof.pi_c[1]);
    const proof_c = Buffer.concat([pi_c_x, pi_c_y]); // 64 bytes BE

    const proofBytes = Buffer.concat([proof_a, proof_b, proof_c]); // 256 bytes total

    return {
        proofA: Array.from(proof_a),     // 64 bytes: -pi_a
        proofB: Array.from(proof_b),     // 128 bytes: pi_b
        proofC: Array.from(proof_c),     // 64 bytes: pi_c
        proofBytes: Array.from(proofBytes), // 256 bytes: concatenado
    };
}

/**
 * Convierte public.json de snarkjs a un array de [u8; 32].
 * Cada public input se serializa como 32 bytes big-endian.
 * El orden es el mismo que en el JSON (el que declaró circom).
 */
function serializePublicInputs(publicJson) {
    const pubs = JSON.parse(fs.readFileSync(publicJson));
    return pubs.map(val => Array.from(bnToBufferBe(val)));
}

// --- MAIN: generar los fixtures para el test ---
function main() {
    const result = serializeProof('circuits/spike/build/proof.json');
    const publicInputs = serializePublicInputs('circuits/spike/build/public.json');

    const output = {
        proofA: result.proofA,
        proofB: result.proofB,
        proofC: result.proofC,
        publicInputs: publicInputs,
    };

    const outPath = 'circuits/spike/build/serialized.json';
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`Serialized proof + public inputs → ${outPath}`);
    console.log(`  proofA: ${result.proofA.length} bytes (negated pi_a)`);
    console.log(`  proofB: ${result.proofB.length} bytes (pi_b)`);
    console.log(`  proofC: ${result.proofC.length} bytes (pi_c)`);
    console.log(`  publicInputs: ${publicInputs.length} inputs`);
}

main();
