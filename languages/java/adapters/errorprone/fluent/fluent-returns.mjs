const CHECK_RETURN_VALUE =
  /^\[CheckReturnValue\] The result of `(?:[\w$]+\.)*([A-Za-z_$][\w$]*)\(([^`]*)\)`/u;
const NOT_A_TYPE_END = new Set([
  'return',
  'new',
  'throw',
  'else',
  'yield',
  'assert',
  'case',
  'await',
]);
const LITERAL =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"""[\s\S]*?(?:"""|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/gu;
const LOOKBEHIND = 200;

function blanked(text) {
  return text.replaceAll(LITERAL, (literal) => literal.replaceAll(/[^\n]/gu, ' '));
}

function closing(text, open, pair) {
  const [left, right] = pair;
  let depth = 0;
  for (const [offset, char] of text.slice(open).split('').entries()) {
    if (char === left) {
      depth += 1;
    }
    if (char === right) {
      depth -= 1;
    }
    if (char === right && depth === 0) {
      return open + offset;
    }
  }
  return -1;
}

const RETURNS_THIS = /^\(*\s*(?:\([\w$.<>?,\s[\]]+\)\s*)?this\s*\)*$/u;
const SELF_CALL = /^([A-Za-z_$][\w$]*)\(\s*\)$/u;
const NESTED_SCOPE = /->|\bclass\b|\bnew\s[\s\w$.<>,?]+\([^;{}]*\)\s*\{/u;
const THROWS = /^\s*throws\s[\w$.,\s<>]+/u;
const RECORD = /\brecord\s+[\w$]+\s*(?:<[^>{(]*>\s*)?\(/gu;

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (const [index, char] of text.split('').entries()) {
    if ('(<[{'.includes(char)) {
      depth += 1;
    } else if (')>]}'.includes(char)) {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

function recordAccessors(text) {
  return [...text.matchAll(RECORD)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const end = closing(text, open, '()');
    const components = end === -1 ? [] : splitTopLevel(text.slice(open + 1, end));
    return components.flatMap((component) => {
      const name = /([\w$]+)\s*$/u.exec(component)?.[1];
      return name === undefined ? [] : [{ name, arity: 0, body: '' }];
    });
  });
}

function isTypeEnd(text, match) {
  const before = text.slice(Math.max(0, match.index - LOOKBEHIND), match.index).trimEnd();
  const previous = /[\w$]+$/u.exec(before)?.[0];
  return /[\w$>\]]$/u.test(before) && !NOT_A_TYPE_END.has(previous);
}

function declarationHead(text, match) {
  if (!isTypeEnd(text, match)) {
    return undefined;
  }
  const parenStart = match.index + match[0].length - 1;
  const parenEnd = closing(text, parenStart, '()');
  if (parenEnd === -1) {
    return undefined;
  }
  const rest = text.slice(parenEnd + 1);
  const tail = rest.slice(THROWS.exec(rest)?.[0].length ?? 0).trimStart();
  return /^[{;]/u.test(tail) ? { parenStart, parenEnd, tail } : undefined;
}

function declarationAt(text, match) {
  const head = declarationHead(text, match);
  if (head === undefined) {
    return undefined;
  }
  const parameters = splitTopLevel(text.slice(head.parenStart + 1, head.parenEnd));
  const declared = {
    name: match[1],
    arity: parameters.length,
    varargs: /\.\.\./u.test(parameters.at(-1) ?? ''),
  };
  if (head.tail.startsWith(';')) {
    return { ...declared, body: '' };
  }
  const open = text.length - head.tail.length;
  const end = closing(text, open, '{}');
  return { ...declared, body: end === -1 ? '' : text.slice(open + 1, end) };
}

function returnedValues(body) {
  if (body === '' || NESTED_SCOPE.test(body)) {
    return [];
  }
  const returns = [...body.matchAll(/\breturn\b([^;]*);/gu)];
  const count = (body.match(/\breturn\b/gu) ?? []).length;
  return returns.length === count ? returns.map(([, value]) => value.trim()) : [];
}

function returnsOnlyThis(body, selfReturns) {
  const values = returnedValues(body);
  return (
    values.length > 0 &&
    values.every((value) => {
      const self = SELF_CALL.exec(value)?.[1];
      return RETURNS_THIS.test(value) || (self !== undefined && selfReturns(self));
    })
  );
}

function fileDeclarations(text, names) {
  const pattern = new RegExp(`(?<![\\w$.])([A-Za-z_$][\\w$]*)\\s*\\(`, 'gu');
  const all = [...text.matchAll(pattern)].flatMap((match) => declarationAt(text, match) ?? []);
  function plain(name) {
    return all.filter((found) => found.name === name && found.arity === 0 && !found.varargs);
  }
  function selfReturns(name) {
    return (
      plain(name).length > 0 && plain(name).every(({ body }) => returnsOnlyThis(body, () => false))
    );
  }
  return [...all, ...recordAccessors(text)]
    .filter(({ name }) => names.has(name))
    .map((found) => ({ ...found, fluent: returnsOnlyThis(found.body, selfReturns) }));
}

function matches(declaration, arity) {
  if (arity === undefined) {
    return declaration.arity > 0 || declaration.varargs === true;
  }
  return (
    declaration.arity === arity || (declaration.varargs === true && arity >= declaration.arity - 1)
  );
}

function arityOf(inside) {
  if (inside === '') {
    return 0;
  }
  return inside === '...' ? undefined : splitTopLevel(inside).length;
}

function parsedCall(diagnostic) {
  if (typeof diagnostic?.message !== 'string') {
    return undefined;
  }
  const found = CHECK_RETURN_VALUE.exec(diagnostic.message);
  if (found === null) {
    return undefined;
  }
  return { name: found[1], arity: arityOf(found[2].trim()) };
}

function isFluentCall({ name, arity }, declarations) {
  const same = (declarations.get(name) ?? []).filter((found) => matches(found, arity));
  return same.length > 0 && same.every(({ fluent }) => fluent);
}

function projectDeclarations(names, sources, readSource) {
  const declarations = new Map();
  for (const file of sources) {
    for (const found of fileDeclarations(blanked(readSource(file)), names)) {
      declarations.set(found.name, [...(declarations.get(found.name) ?? []), found]);
    }
  }
  return declarations;
}

export function withoutFluentCalls(diagnostics, { sources, readSource }) {
  const calls = diagnostics.map(parsedCall);
  const names = new Set(calls.filter((call) => call !== undefined).map(({ name }) => name));
  if (names.size === 0) {
    return diagnostics;
  }
  const declarations = projectDeclarations(names, sources, readSource);
  return diagnostics.filter(
    (_, index) => calls[index] === undefined || !isFluentCall(calls[index], declarations),
  );
}
