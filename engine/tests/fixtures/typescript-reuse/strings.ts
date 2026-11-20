declare function isValidNamespace(name: string): boolean;

export const loneHalf = () => ["\uD800", "a\ud800b\udc00c😀d", `\uD83D${1}\uDE00`, "\uD83D\uDE00", `\udc00`];
export const tagged = () => [String.raw`C:\users\x${1}\u{zz}`, String.raw`a\6fr\08\0!\xZ\n`, String.raw`\u{1F600}\x41\u{}`];

export function cut() {
  return isValidNamespace('testlength😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀');
}

export const big = () => [0xFFn, 0XAn, 0b11n, 0o17n, 0b0n, 0O1n, 1_0n, 0xDEADBEEFn, 0b1000000000000000000000000000000000000000000000000000000000000000000000000000000000000n];

export const targets = (a: unknown, b: unknown[], c: unknown[], o: any) => {
  [(a as any)] = b;
  for ((a as any) of c) {
    b.push(a);
  }
  ({ k: (a as any) } = o);
  [...(a as any)] = o;
  ({ ...(a as any) } = o);
  for ((a!) in o) {
    b.push(a);
  }
  [(a as any) = 2] = o;
  (a as any) = 3;
};

export const asi = (y: any) => { let x
!y.z(); return x };
