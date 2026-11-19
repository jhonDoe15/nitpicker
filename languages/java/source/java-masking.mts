const TOKEN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g;

function blanked(text: string): string {
  return text.replaceAll(/[^\n]/g, ' ');
}

export function maskJavaSource(source: string): string {
  return source.replaceAll(TOKEN, (token) => {
    if (token.startsWith('//') || token.startsWith('/*')) {
      return blanked(token);
    }
    const quote = token.startsWith('"""') ? '"""' : token.charAt(0);
    return `${quote}${blanked(token.slice(quote.length, -quote.length))}${quote}`;
  });
}
