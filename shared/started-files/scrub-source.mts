const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*(?:"|\\?$)|'(?:\\[\s\S]|[^'\\])*(?:'|\\?$)|`(?:\\[\s\S]|[^`\\])*(?:`|\\?$)/gu;
const QUOTES = new Set(['"', "'", '`']);

function blanked(text: string): string {
  return text.replace(/[^\n]/gu, ' ');
}

export function scrubSource(
  text: string,
  { keepStrings }: { readonly keepStrings: boolean },
): string {
  return text.replace(TOKEN, (token) =>
    keepStrings && QUOTES.has(token.charAt(0)) ? token : blanked(token),
  );
}
