import { chainName, classesOf } from '../../discovery/declarations.mjs';
import { importsOf } from '../../discovery/imports.mjs';
import { isSpecType, specBodies } from '../../discovery/kotest/kotest-specs.mjs';
import { viewOf } from '../../discovery/kotest/kotest-registrations.mjs';
import { closeOf, lineStartOf, repeatUntil } from '../../discovery/text-scan.mjs';
import { retriesOn, zeroConstants } from './retry-values.mjs';

const CONFIG_TYPES = ['AbstractProjectConfig', 'AbstractPackageConfig'];
const CONFIG_CONSTRUCTORS = new Set(['TestConfig', 'DefaultTestConfig']);
const MAX_NESTING = 16;
const MAX_MEMBER_LINES = 20;
const NESTED_CALL = /\([^()]*\)/gu;
const RETRIES_ARGUMENT = /(?<![\w.`])retries\s*=\s*([^,)\n]+)/u;
const FULLY_QUALIFIED =
  String.raw`(?<![\w` + '`' + String.raw`])io\.kotest(?:\.\w+)*\.(?:Default)?TestConfig\s*\(`;
const RETRIES_ASSIGNMENT = /(?:^|[;{\n])[ \t]*(?:this\.)?retries[ \t]*=(?!=)[ \t]*([^\n;]*)/gu;
const RETRIES_OVERRIDE = /(?<![\w`])override\s+(?:val|var)\s+retries\b/gu;
const CONTINUATION = /^\s*(?:=|get\b|\.)/u;
const LAZY_VALUE = /\bby\s+lazy\s*\{([^}]*)\}/u;
const RETURN_VALUE = /\breturn\s+([^\n;}]*)/u;
const EQUALS_VALUE = /=(?!=)\s*([^\n;]*)/u;

function isKotest(qualified) {
  return qualified === 'io.kotest' || qualified.startsWith('io.kotest.');
}

function withoutNestedCalls(text) {
  const state = { text };
  repeatUntil(MAX_NESTING, () => {
    const flat = state.text.replaceAll(NESTED_CALL, '');
    const done = flat === state.text;
    state.text = flat;
    return done;
  });
  return state.text;
}

function argumentRetries(text, zeros) {
  return retriesOn(RETRIES_ARGUMENT.exec(withoutNestedCalls(text))?.[1], zeros);
}

function configRetries(suites, zeros) {
  return suites
    .flatMap((suite) => suite.nodes)
    .filter((node) => node.configs.some((config) => argumentRetries(config, zeros)))
    .map(({ symbol, offset }) => ({ symbol, offset, key: `${symbol}:config` }));
}

function constructorNames(scanned) {
  const { explicit, aliases, stars } = importsOf(scanned);
  const imported = [...CONFIG_CONSTRUCTORS].filter((name) =>
    explicit.has(name) ? isKotest(explicit.get(name)) : [...stars].some(isKotest),
  );
  const renamed = [...aliases]
    .filter(([, { target, qualified }]) => CONFIG_CONSTRUCTORS.has(target) && isKotest(qualified))
    .map(([alias]) => alias);
  return [...imported, ...renamed];
}

function constructorRetries(scanned, classes, zeros) {
  const names = constructorNames(scanned);
  const named =
    names.length === 0
      ? []
      : [String.raw`(?<![\w.` + '`' + String.raw`])(?:${names.join('|')})\s*\(`];
  const pattern = new RegExp([...named, FULLY_QUALIFIED].join('|'), 'gu');
  return [...scanned.code.matchAll(pattern)]
    .filter((match) => {
      const open = match.index + match[0].length - 1;
      return argumentRetries(scanned.source.slice(open + 1, closeOf(scanned, open)), zeros);
    })
    .map((match) => {
      const symbol = chainName(classes, match.index);
      return { symbol, offset: match.index, key: `${symbol}:testConfig` };
    });
}

function configNames(classes) {
  const names = new Set(CONFIG_TYPES);
  repeatUntil(MAX_NESTING, () => {
    const before = names.size;
    for (const klass of classes) {
      if (klass.supers.some(({ name }) => names.has(name))) {
        names.add(klass.name);
      }
    }
    return names.size === before;
  });
  return names;
}

function memberText(code, from) {
  const indent =
    from - lineStartOf(code, from) - code.slice(lineStartOf(code, from), from).trimStart().length;
  const lines = code.slice(from).split('\n');
  const own = [lines[0]];
  for (const line of lines.slice(1, MAX_MEMBER_LINES)) {
    const deeper = line.search(/\S/u) > indent;
    if (line.trim() === '' || !(deeper || CONTINUATION.test(line))) {
      break;
    }
    own.push(line);
  }
  return own.join('\n');
}

function overrideValue(member) {
  return (
    LAZY_VALUE.exec(member)?.[1] ?? RETURN_VALUE.exec(member)?.[1] ?? EQUALS_VALUE.exec(member)?.[1]
  );
}

function overrides(scanned, klass, zeros) {
  return [...scanned.code.slice(klass.offset, klass.end).matchAll(RETRIES_OVERRIDE)]
    .map((match) => ({
      offset: klass.offset + match.index,
      value: overrideValue(memberText(scanned.code, klass.offset + match.index + match[0].length)),
    }))
    .filter(({ value }) => retriesOn(value, zeros));
}

function assignments(scanned, klass, zeros) {
  const { braces, parens } = viewOf(scanned);
  return specBodies(scanned, klass).flatMap((body) =>
    [...scanned.code.slice(body.start, body.end).matchAll(RETRIES_ASSIGNMENT)]
      .map((match) => ({
        offset: body.start + match.index + match[0].search(/\S/u),
        value: match[1],
      }))
      .filter(
        ({ offset, value }) =>
          braces[offset] === braces[body.start] &&
          parens[offset] === parens[body.start] &&
          retriesOn(value, zeros),
      ),
  );
}

function declaredRetries(scanned, classes, zeros) {
  const configs = configNames(classes);
  return classes.flatMap((klass) => {
    const names = klass.supers.map(({ name }) => name);
    const found = [
      ...(names.some(isSpecType) ? assignments(scanned, klass, zeros) : []),
      ...(names.some((name) => configs.has(name)) ? overrides(scanned, klass, zeros) : []),
    ];
    const symbol = chainName(classes, klass.offset, klass.name);
    return found.map(({ offset }) => ({ symbol, offset, key: `${symbol}:retries` }));
  });
}

export function kotestRetries(scanned, suites) {
  const classes = classesOf(scanned);
  const zeros = zeroConstants(scanned);
  return [
    ...configRetries(suites, zeros),
    ...constructorRetries(scanned, classes, zeros),
    ...declaredRetries(scanned, classes, zeros),
  ];
}
