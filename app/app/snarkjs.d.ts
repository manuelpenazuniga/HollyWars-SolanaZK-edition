// snarkjs ships no types; we use groth16.fullProve / groth16.verify (typed loosely).
declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: unknown; publicSignals: unknown }>;
    verify(
      vkey: unknown,
      publicSignals: unknown,
      proof: unknown,
    ): Promise<boolean>;
  };
}
