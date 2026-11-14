const LAMBDA_PARAMETERS = /(?:\(([^()]*)\)|(?<![\w$.])([A-Za-z_$][\w$]*))\s*->/gu;
const GETTER_REFERENCE = /(?<![\w$.])([A-Za-z_$][\w$.]*)\s*::\s*((?:get|is)\p{Lu}[\w$]*)/gu;
const GETTER_CALLS = /^(?:\s*\.\s*(?:get|is)\p{Lu}[\w$]*\s*\(\s*\))+/u;
const GETTER_NAME = /(?:get|is)\p{Lu}[\w$]*/gu;
const NAME = /([A-Za-z_$][\w$]*)\s*$/u;
const LOADED = /^[\w$.\s]*\.\s*findAll\s*\(\s*\)/u;
const HEAD = /^\s*([A-Za-z_$][\w$]*)\s*\./u;
const COLLECTION_GETTERS = new Set(['isEmpty']);

function escaped(text) {
  return text.replaceAll('$', String.raw`\$`);
}

export function firstOperation(chain) {
  let depth = 0;
  let open = 0;
  for (const [index, character] of [...chain].entries()) {
    if (character === '(' && depth++ === 0) {
      open = index;
    }
    const closes = character === ')' && --depth === 0;
    const inner = closes ? chain.slice(open, index) : '';
    if (inner.includes('->') || inner.includes('::')) {
      return chain.slice(0, index + 1);
    }
  }
  return chain;
}

export function loadsAll(text, chain, offset) {
  if (LOADED.test(chain)) {
    return true;
  }
  const head = HEAD.exec(chain)?.[1];
  if (head === undefined) {
    return false;
  }
  const declared = new RegExp(
    String.raw`\b${escaped(head)}\s*=\s*[\w$.\s]*\.\s*findAll\s*\(\s*\)\s*;`,
    'u',
  );
  return declared.test(text.slice(0, offset));
}

function lambdaParameters(chain) {
  return [...chain.matchAll(LAMBDA_PARAMETERS)].flatMap((match) =>
    match[2] === undefined
      ? match[1]
          .split(',')
          .map((parameter) => NAME.exec(parameter)?.[1])
          .filter((name) => name !== undefined)
      : [match[2]],
  );
}

function getterPaths(chain, parameter) {
  const start = new RegExp(String.raw`(?<![\w$.])${escaped(parameter)}(?![\w$])`, 'gu');
  return [...chain.matchAll(start)].map((match) => {
    const calls = GETTER_CALLS.exec(chain.slice(match.index + match[0].length))?.[0] ?? '';
    return (calls.match(GETTER_NAME) ?? []).filter((getter) => !COLLECTION_GETTERS.has(getter));
  });
}

export function readsOf(chain) {
  const parameters = new Set(lambdaParameters(chain));
  return {
    paths: [...parameters].flatMap((parameter) => getterPaths(chain, parameter)),
    references: [...chain.matchAll(GETTER_REFERENCE)].map((match) => ({
      type: match[1],
      getter: match[2],
    })),
  };
}
