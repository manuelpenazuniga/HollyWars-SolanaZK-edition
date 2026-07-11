declare module "tweetnacl" {
  export function sign(
    msg: Uint8Array,
    secretKey: Uint8Array,
  ): Uint8Array;
  export namespace sign {
    export function detached(
      msg: Uint8Array,
      secretKey: Uint8Array,
    ): Uint8Array;
    export const publicKeyLength: number;
    export const secretKeyLength: number;
    export const signatureLength: number;
  }
}
