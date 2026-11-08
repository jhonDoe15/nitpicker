import path from 'node:path';
import { expressionAt, offsetOf, readJavaSource } from '../../review-rules/java-sources.mjs';
import { entityColumns } from './entity-columns.mjs';

const RULE = 'SpringDataFilterInQuery';
const LAMBDA_PARAMETERS = /(?:\(([^()]*)\)|(?<![\w$.])([A-Za-z_$][\w$]*))\s*->/gu;
const GETTER_REFERENCE = /(?<![\w$.])([A-Za-z_$][\w$.]*)\s*::\s*((?:get|is)\p{Lu}[\w$]*)/gu;
const GETTER_CALL = /^\s*\.\s*((?:get|is)\p{Lu}[\w$]*)\s*\(\s*\)/u;
const NAME = /([A-Za-z_$][\w$]*)\s*$/u;
const COLLECTION_GETTERS = new Set(['isEmpty']);

function escaped(text) {
  return text.replaceAll(/[$]/gu, String.raw`\$`);
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
    const getters = [];
    let rest = chain.slice(match.index + match[0].length);
    for (let call = GETTER_CALL.exec(rest); call !== null; call = GETTER_CALL.exec(rest)) {
      if (!COLLECTION_GETTERS.has(call[1])) {
        getters.push(call[1]);
      }
      rest = rest.slice(call[0].length);
    }
    return getters;
  });
}

function readsOf(chain) {
  const parameters = new Set(lambdaParameters(chain));
  return {
    paths: [...parameters].flatMap((parameter) => getterPaths(chain, parameter)),
    references: [...chain.matchAll(GETTER_REFERENCE)].map((match) => ({
      type: match[1],
      getter: match[2],
    })),
  };
}

function readsColumns(columns, { paths, references }) {
  return (
    paths.every((getters) => getters.length === 0 || columns.readsColumns(getters)) &&
    references.every(({ type, getter }) => columns.isColumnOf(type, getter))
  );
}

export function dropComputedReads(findings, { projectRoot, roots }) {
  let columns;
  return findings.filter((finding) => {
    if (finding.tool !== 'pmd' || finding.rule !== RULE) {
      return true;
    }
    const text = readJavaSource(path.join(projectRoot, finding.path));
    if (text === undefined) {
      return true;
    }
    const chain = expressionAt(text, offsetOf(text, finding.location ?? { line: 1 }));
    const reads = readsOf(chain);
    if (reads.paths.every((getters) => getters.length === 0) && reads.references.length === 0) {
      return true;
    }
    columns ??= entityColumns(projectRoot, roots);
    return readsColumns(columns, reads);
  });
}
