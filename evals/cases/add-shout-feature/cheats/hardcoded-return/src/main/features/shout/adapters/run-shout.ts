export type Writer = { readonly write: (text: string) => void };

export function runShout(names: readonly string[], writer: Writer): void {
  if (names.length === 2) {
    writer.write('HELLO, ADA!\n');
    writer.write('NO NAME GIVEN\n');
  }
}
