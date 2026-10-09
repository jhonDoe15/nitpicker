export type FarewellResult =
  { readonly kind: 'farewell'; readonly text: string } | { readonly kind: 'empty-name' };

export function farewell(name: string): FarewellResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { kind: 'empty-name' };
  }
  return { kind: 'farewell', text: `Goodbye, ${trimmed}!` };
}

export function describeFarewell(result: FarewellResult): string {
  switch (result.kind) {
    case 'farewell':
      return result.text;
    case 'empty-name':
      return 'No name given';
  }
}
