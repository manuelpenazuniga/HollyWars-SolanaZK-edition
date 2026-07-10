/**
 * gen_vkey.js — verification_key.json (snarkjs) → verifying_key.rs (groth16-solana)
 *
 * CONVENCIÓN CANÓNICA (la que espera el syscall alt_bn128 de Solana, = ecPairing de Ethereum):
 *  - Todos los field elements en BIG-ENDIAN, 32 bytes.
 *  - G1 (alpha, IC): (x, y) → 64 bytes. Sin negación (solo la A de la PROOF se niega, no la vkey).
 *  - G2 (beta, gamma, delta): Fp2 con IMAGINARIO PRIMERO (c1, c0).
 *    snarkjs guarda [[x_c0,x_c1],[y_c0,y_c1]]; el syscall espera x_c1,x_c0,y_c1,y_c0.
 *    Este SWAP es el gotcha que hace fallar proofs válidas si falta (off-chain verifica igual).
 *
 * Genera el MISMO layout de struct que usa la crate (con el typo real `vk_gamme_g2`).
 */
const fs = require('fs');
const { unstringifyBigInts, leInt2Buff } = require('ffjavascript').utils;

function beBytes(dec) {
  const le = leInt2Buff(unstringifyBigInts(dec), 32);
  return Array.from(Buffer.from(le).reverse());
}
// G1: [x, y] big-endian (snarkjs da [x, y, "1"])
function g1(p) { return [...beBytes(p[0]), ...beBytes(p[1])]; }
// G2 con swap de Fp2 (c1, c0): snarkjs [[x0,x1],[y0,y1]] -> x1,x0,y1,y0
function g2(p) {
  return [...beBytes(p[0][1]), ...beBytes(p[0][0]), ...beBytes(p[1][1]), ...beBytes(p[1][0])];
}
function fmt(arr) {
  const lines = [];
  for (let i = 0; i < arr.length; i += 32) lines.push('        ' + arr.slice(i, i + 32).join(', '));
  return lines.join(',\n');
}

const vkPath = process.argv[2] || __dirname + '/build/verification_key.json';
const outPath = process.argv[3] || __dirname + '/../../programs/verifier-spike/src/verifying_key.rs';
const vk = JSON.parse(fs.readFileSync(vkPath));

const ic = vk.IC.map(p => `        [\n${fmt(g1(p))}\n        ]`).join(',\n');

const rs = `use groth16_solana::groth16::Groth16Verifyingkey;

// GENERADO por circuits/spike/gen_vkey.js — NO editar a mano.
// Convención: BE 32B; G2 con Fp2 imaginario-primero (c1,c0) para el syscall alt_bn128.
pub const VERIFYING_KEY: Groth16Verifyingkey = Groth16Verifyingkey {
    nr_pubinputs: ${vk.nPublic},

    vk_alpha_g1: [
${fmt(g1(vk.vk_alpha_1))}
    ],

    vk_beta_g2: [
${fmt(g2(vk.vk_beta_2))}
    ],

    vk_gamme_g2: [
${fmt(g2(vk.vk_gamma_2))}
    ],

    vk_delta_g2: [
${fmt(g2(vk.vk_delta_2))}
    ],

    vk_ic: &[
${ic}
    ],
};
`;
fs.writeFileSync(outPath, rs);
console.log('vkey escrita:', outPath, '| nPublic:', vk.nPublic, '| IC:', vk.IC.length);
