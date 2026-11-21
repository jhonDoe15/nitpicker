type TokenRules<Token> = {
  readonly step: (token: Token) => number;
  readonly isComma: (token: Token) => boolean;
};

export function commaParts<Token>(
  tokens: readonly Token[],
  { step, isComma }: TokenRules<Token>,
): Token[][] {
  let current: Token[] = [];
  const parts = [current];
  let depth = 0;
  for (const token of tokens) {
    depth += step(token);
    if (isComma(token) && depth === 0) {
      current = [];
      parts.push(current);
    } else {
      current.push(token);
    }
  }
  return parts.filter((part) => part.length > 0);
}
