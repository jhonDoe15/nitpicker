import { entityKey } from './scanning/names.mjs';

const WRITE_MARKER = new RegExp(
  [
    String.raw`@(?:RequestBody|ModelAttribute|PostMapping|PutMapping|PatchMapping|Body|Post|Put|Patch)\b`,
    String.raw`@\w+\.(?:post|put|patch)\(`,
    String.raw`\b(?:app|router|server|api|route)\.(?:post|put|patch)\(`,
    String.raw`\b(?:req|request)\.(?:body|json|data|POST|get_json|form)\b`,
    String.raw`\bc\.(?:Bind|ShouldBind|BodyParser)\w*\(|\bShouldBind\w*\(|\bBindJSON\(`,
    String.raw`json\.NewDecoder\(\s*\w+\.Body`,
    String.raw`@api_view\b|\bawait\s+request\.json\(`,
  ].join('|'),
  'u',
);
const TEST_FOLDER = String.raw`(?:^|\/)(?:src\/test|tests?|__tests__|spec|fixtures?|testdata|e2e)\/`;
const TEST_FILE = String.raw`\.(?:test|spec)\.\w+$|Tests?\.(?:java|kt)$|_test\.go$|(?:^|\/)test_\w+\.py$`;
const TEST_PATH = new RegExp(`${TEST_FOLDER}|${TEST_FILE}`, 'u');
const WORD = /\b[A-Za-z_]\w{2,}\b/gu;
const SOURCE = /\.(?:java|kt|ts|tsx|mts|js|mjs|py|go)$/u;

export function isTestPath(file) {
  return TEST_PATH.test(file);
}

function wordKeys(text) {
  return [...text.matchAll(WORD)].map(([word]) => entityKey(word));
}

export function requestBoundNames(files, readText) {
  const candidates = files.filter((file) => SOURCE.test(file) && !isTestPath(file));
  const texts = candidates.map((file) => readText(file));
  return new Set(
    texts.filter((text) => text !== undefined && WRITE_MARKER.test(text)).flatMap(wordKeys),
  );
}
