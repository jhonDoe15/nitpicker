export type GreetResult =
  { readonly kind: 'greeted'; readonly text: string } | { readonly kind: 'empty-name' };

export function greet(name: string): GreetResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { kind: 'empty-name' };
  }
  return { kind: 'greeted', text: `Hello, ${trimmed}!` };
}

export function describeResult(result: GreetResult): string {
  switch (result.kind) {
    case 'greeted':
      return result.text;
    case 'empty-name':
      return 'No name given';
  }
}

export const widened = ['a'] as readonly string[];
