const SPOTLESS = /\bspotless\s*\{/gu;
const JAVA_BLOCK = /\bjava\s*\{/gu;
const STEP = /\b(palantirJavaFormat|googleJavaFormat)\s*\(/giu;
const CHAIN_CALL = /^\s*\.\s*(\w+)\s*\(/u;

function depthChange(char, [left, right]) {
  if (char === left) {
    return 1;
  }
  return char === right ? -1 : 0;
}

function closing(text, open, brackets) {
  let depth = 0;
  for (const [offset, char] of text.slice(open).split('').entries()) {
    depth += depthChange(char, brackets);
    if (depth === 0) {
      return open + offset;
    }
  }
  return text.length - 1;
}

function blocksAfter(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => {
    const open = match.index + match[0].length - 1;
    return text.slice(open + 1, closing(text, open, ['{', '}']));
  });
}

export function spotlessJavaBlocks(code) {
  const spotless = blocksAfter(code, SPOTLESS);
  return spotless.length === 0
    ? undefined
    : spotless.flatMap((body) => blocksAfter(body, JAVA_BLOCK));
}

export function outsideSpotless(code) {
  let rest = code;
  for (const match of [...code.matchAll(SPOTLESS)].toReversed()) {
    const open = match.index + match[0].length - 1;
    rest = rest.slice(0, open) + rest.slice(closing(code, open, ['{', '}']) + 1);
  }
  return rest;
}

function callAt(text, open) {
  const end = closing(text, open, ['(', ')']);
  return { argument: text.slice(open + 1, end), end };
}

function chainAfter(text, from) {
  const chain = [];
  const starts = [from];
  for (const start of starts) {
    const match = CHAIN_CALL.exec(text.slice(start));
    if (match !== null) {
      const { argument, end } = callAt(text, start + match[0].length - 1);
      chain.push({ name: match[1].toLowerCase(), argument });
      starts.push(end + 1);
    }
  }
  return chain;
}

export function formatterSteps(block) {
  return [...block.matchAll(STEP)].map((match) => {
    const open = match.index + match[0].length - 1;
    const { argument, end } = callAt(block, open);
    return { name: match[1].toLowerCase(), version: argument, chain: chainAfter(block, end + 1) };
  });
}
