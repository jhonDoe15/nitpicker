const SINGLE_ITEM_FUNCTIONS =
  /(?<![\w:$.-])(?:fn:)?(?:string|lower-case|upper-case|starts-with|ends-with|contains|matches|normalize-space)\s*\(/gu;
const ANCESTOR_UNIT = /ancestor(?:-or-self)?::CompilationUnit\s*\/\//gu;
const MULTI_CHILD_STEP =
  /\b(FormalParameters|ArgumentList|ClassBody|Block)\s*\/\s*([A-Z]\w*|\*)(?!\w)(?!\s*[[(])/gu;
const KEYWORDS = new Set([
  'and',
  'or',
  'eq',
  'ne',
  'lt',
  'le',
  'gt',
  'ge',
  'return',
  'in',
  'then',
  'else',
  'satisfies',
  'not',
]);
const PATH_CHARACTERS = /[\w:@./*$-]/u;
const OPENING = new Set(['(', '[', '{']);
const CLOSING = new Set([')', ']', '}']);
const OPERATOR_BEFORE_PATH = new Set(['(', '[', ',', '=', '!', '<', '>', '|', '+', '-', '?']);

export type XPathMistake = {
  readonly kind: 'predicate-scan' | 'several-nodes';
  readonly text: string;
};

function previousWord(xpath: string, end: number): string {
  const before = xpath.slice(0, end);
  return /([\w-]+)\s*$/u.exec(before)?.[1] ?? '';
}

function startsAbsolutePath(xpath: string, index: number): boolean {
  if (xpath[index - 1] === '/') {
    return false;
  }
  const before = xpath.slice(0, index).trimEnd();
  const last = before.at(-1);
  if (last === undefined) {
    return true;
  }
  return (
    OPERATOR_BEFORE_PATH.has(last) ||
    (/\w/u.test(last) && KEYWORDS.has(previousWord(xpath, before.length)))
  );
}

function predicateDepths(xpath: string): number[] {
  const depths: number[] = [];
  let depth = 0;
  for (const character of xpath) {
    if (character === ']') {
      depth = Math.max(0, depth - 1);
    }
    depths.push(depth);
    if (character === '[') {
      depth += 1;
    }
  }
  return depths;
}

export function predicateScans(xpath: string): string[] {
  const depths = predicateDepths(xpath);
  const absolute = [...xpath.matchAll(/\//gu)]
    .filter(({ index }) => (depths[index] ?? 0) > 0 && startsAbsolutePath(xpath, index))
    .map(({ index }) => xpath.slice(index).split(/[\s\][)]/u)[0] ?? '')
    .filter((path) => path.includes('//'))
    .map((path) => path.slice(0, 24));
  const ancestors = [...xpath.matchAll(ANCESTOR_UNIT)]
    .filter(({ index }) => (depths[index] ?? 0) > 0)
    .map(() => 'ancestor::CompilationUnit//');
  return [...absolute, ...ancestors];
}

function closingParenthesis(xpath: string, open: number): number {
  let depth = 0;
  for (let index = open; index < xpath.length; index += 1) {
    const character = xpath[index] ?? '';
    depth += OPENING.has(character) ? 1 : 0;
    depth -= CLOSING.has(character) ? 1 : 0;
    if (depth === 0) {
      return index;
    }
  }
  return -1;
}

function topLevelOf(text: string): string {
  let depth = 0;
  let result = '';
  for (const character of text) {
    depth = CLOSING.has(character) ? Math.max(0, depth - 1) : depth;
    result += depth === 0 ? character : ' ';
    depth += OPENING.has(character) ? 1 : 0;
  }
  return result;
}

function unguardedSteps(operand: string, xpath: string): string[] {
  return [...topLevelOf(operand).matchAll(MULTI_CHILD_STEP)]
    .map((match) => `${match[1] ?? ''}/${match[2] ?? ''}`)
    .filter((step) => {
      const [parent = '', child = ''] = step.split('/');
      const guard = new RegExp(
        `count\\(\\s*[^()]*${parent}\\s*/\\s*${child === '*' ? '\\*' : child}\\s*\\)\\s*(?:=|eq)\\s*1\\b`,
        'u',
      );
      return !guard.test(xpath);
    });
}

function functionArguments(xpath: string): string[] {
  return [...xpath.matchAll(SINGLE_ITEM_FUNCTIONS)].flatMap((match) => {
    const open = (match.index ?? 0) + match[0].length - 1;
    const close = closingParenthesis(xpath, open);
    return close === -1 ? [] : [xpath.slice(open + 1, close)];
  });
}

function splitArguments(text: string): string[] {
  const flat = topLevelOf(text);
  const parts: string[] = [];
  let from = 0;
  [...flat].forEach((character, index) => {
    if (character === ',') {
      parts.push(text.slice(from, index));
      from = index + 1;
    }
  });
  return [...parts, text.slice(from)];
}

function comparisonOperands(xpath: string): string[] {
  return [...xpath.matchAll(/\s(?:eq|ne)\s/gu)].flatMap((match) => {
    const index = match.index ?? 0;
    const left = /([\w:@./*$-]+)$/u.exec(xpath.slice(0, index))?.[1] ?? '';
    const right = /^\s*([\w:@./*$-]+)(?!\s*[[(])/u.exec(xpath.slice(index + match[0].length));
    const rightText = right?.[1] ?? '';
    const afterRight = xpath.slice(index + match[0].length + (right?.[0].length ?? 0)).trimStart();
    return [left, afterRight.startsWith('[') || afterRight.startsWith('(') ? '' : rightText];
  });
}

export function severalNodeUses(xpath: string): string[] {
  const operands = [
    ...functionArguments(xpath).flatMap(splitArguments),
    ...comparisonOperands(xpath),
  ].filter((operand) => PATH_CHARACTERS.test(operand));
  return [...new Set(operands.flatMap((operand) => unguardedSteps(operand, xpath)))];
}
