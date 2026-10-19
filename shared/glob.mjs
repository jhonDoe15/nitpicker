// Glob matching shared by every language: `**`, `*`, `?` and `{a,b}` over `/` paths.

/** Translates one glob (`**`, `*`, `?`, `{a,b}`) into a regular expression source for `/` paths. */
export function globToRegExpSource(glob) {
  let source = '';
  let braceDepth = 0;
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') {
      const followedBySlash = glob[index + 2] === '/';
      source += followedBySlash ? '(?:|.*/)' : '.*';
      index += followedBySlash ? 2 : 1;
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else if (character === '{') {
      braceDepth += 1;
      source += '(?:';
    } else if (character === '}' && braceDepth > 0) {
      braceDepth -= 1;
      source += ')';
    } else if (character === ',' && braceDepth > 0) {
      source += '|';
    } else {
      source += escapeRegExp(character);
    }
  }
  return `^(?:${source})$`;
}

export function globToRegExp(glob) {
  return new RegExp(globToRegExpSource(glob));
}

export function escapeRegExp(value) {
  return value.replace(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}
