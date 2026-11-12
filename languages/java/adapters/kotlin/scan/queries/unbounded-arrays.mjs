import { functionAround } from './query-scope.mjs';

const UNBOUNDED_RULE = 'UnboundedQueryArray';

const VALUE = String.raw`([A-Za-z_]\w*)\s*[,)]`;
const SINKS = [
  new RegExp(
    String.raw`\.\s*(?:setParameter|setParameterList|addValue|param)\s*\(\s*(?:"[^"\n]*"|\d+)\s*,\s*${VALUE}`,
    'g',
  ),
  new RegExp(String.raw`(?<![\w$])MapSqlParameterSource\s*\(\s*"[^"\n]*"\s*,\s*${VALUE}`, 'g'),
  new RegExp(
    String.raw`\.\s*(?:findAllById|deleteAllByIdInBatch|deleteAllInBatch)\s*\(\s*${VALUE}`,
    'g',
  ),
];
const COLLECTION_TYPE = String.raw`(?:Mutable)?(?:List|Set|Collection|Iterable)\s*<`;
const COLLECTION_CALLS = String.raw`\.\s*(?:map|mapNotNull|filter|filterNot|flatMap|toList|toSet|toMutableList|toMutableSet|distinct|sorted|sortedBy)\b`;
const FIXED_MAKERS = String.raw`(?<![\w$])(?:listOf|setOf|mutableListOf|emptyList|emptySet|listOfNotNull)\s*\(`;
const ENUM_SETS = String.raw`(?<![\w$])EnumSet\s*\.\s*(?:allOf|of|noneOf|range)\s*\(`;
const WINDOWS = String.raw`\.\s*(?:take|chunked|windowed|subList)\s*\(`;
const FIXED = new RegExp(`${FIXED_MAKERS}|${ENUM_SETS}|${WINDOWS}`, 'u');

export const QUERY_ARRAY_MESSAGES = {
  [UNBOUNDED_RULE]:
    "Return early when the collection is empty, and bound its size or split it into chunks first (`ids.chunked(1000).forEach { chunk -> ... }` or the project's chunking helper), or send it as one array parameter (`where id = any(:ids)` with a SQL array). This collection is bound as one query parameter per element (an in list): an empty collection renders `in ()`, which some databases reject, and PostgreSQL takes at most 65,535 bound parameters in one statement, so the query works in tests and fails on a large account. An exception fits only a collection that its callers bound, such as a request field with a maximum size.",
};

function declaredCollection(scope, name) {
  const parameter = new RegExp(
    String.raw`(?<![\w$.])${name}\s*:\s*${COLLECTION_TYPE}(?![^(){}\n]*->)`,
    'u',
  );
  const local = new RegExp(
    String.raw`(?<![\w$])va[lr]\s+${name}\s*(?::\s*${COLLECTION_TYPE}[^=\n]*)?=([^\n]*)`,
    'u',
  );
  const declared = local.exec(scope);
  if (declared !== null) {
    const typed = new RegExp(String.raw`^\s*va[lr]\s+${name}\s*:`, 'u').test(declared[0]);
    return (
      !FIXED.test(declared[1]) && (typed || new RegExp(COLLECTION_CALLS, 'u').test(declared[1]))
    );
  }
  return parameter.test(scope);
}

function isBounded(scope, name) {
  const checks = new RegExp(
    String.raw`(?<![\w$.])${name}\s*\??\.\s*(?:size\b|isEmpty\s*\(|isNotEmpty\s*\(|isNullOrEmpty\s*\(|count\s*\(|ifEmpty\b|chunked\s*\(|windowed\s*\()`,
    'u',
  );
  return checks.test(scope);
}

export function unboundedQueryArrays(scanned) {
  const { code } = scanned;
  return SINKS.flatMap((sink) => [...code.matchAll(sink)])
    .flatMap((match) => {
      const name = match[1];
      const offset = match.index + match[0].lastIndexOf(name);
      const scope = functionAround(code, match.index).text;
      return declaredCollection(scope, name) && !isBounded(scope, name) ? [offset] : [];
    })
    .toSorted((left, right) => left - right)
    .map((offset) => ({ rule: UNBOUNDED_RULE, offset }));
}
