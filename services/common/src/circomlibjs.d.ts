declare module "circomlibjs" {
  export function buildPoseidon(): Promise<{
    F: {
      toString(element: unknown): string;
    };
    (inputs: (bigint | number | string)[]): unknown;
  }>;
}
