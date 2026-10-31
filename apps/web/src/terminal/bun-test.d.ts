// Minimal typing so tsc -p . accepts bun:test without adding bun-types as a dependency.
// Matchers are deliberately loose: this file is shared by every *.test.ts in the web app.
declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function expect(actual: unknown): any;
}
