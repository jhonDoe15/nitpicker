type Writer = { readonly write: (text: string) => void };

export function writeLines(lines: readonly string[], writer: Writer): void {
  for (const line of lines) {
    writer.write(`${line}\n`);
  }
}
