const STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu;
const LEADING_DECORATORS = /^(?:@\w+(?:\([^)]*\))?\s+)+(?=\S)/u;
const BRACKETS_ONLY = /^[{}()[\],;]*$/u;
const KOTLIN_MODIFIERS =
  '(?:(?:public|private|protected|internal|override|open|abstract|const|lateinit)\\s+)*';
const TYPE_TEXT = String.raw`[\w<>?,. [\]]+`;
const TS_MODIFIERS = String.raw`(?:(?:public|private|protected|static|readonly)\s+)*`;
const KOTLIN_TYPES = 'data|sealed|open|abstract|enum|annotation|inline|value|private|internal';

const PATTERNS = {
  typescript: [
    BRACKETS_ONLY,
    /^@\w+(?:\(.*\))?$/u,
    /^return\s+(?:this\.)?\w+;?$/u,
    /^this\.\w+ = \w+;?$/u,
    new RegExp(`^${TS_MODIFIERS}(?:override\s+)?\\w+\\??: [^=]+;?,?$`, 'u'),
    new RegExp(`^${TS_MODIFIERS}(?:(?:get|set)\\s+)?\\w+\\([^)]*\\)(?: ?: [^{]+)? ?\\{$`, 'u'),
    /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+\w.*\{$/u,
  ],
  python: [
    BRACKETS_ONLY,
    /^@\w[\w.]*(?:\(.*\))?$/u,
    /^class\s+\w.*:$/u,
    /^(?:async\s+)?def\s+\w+\(.*\)(?: -> .+)?:$/u,
    /^self\.\w+ = \w+$/u,
    /^return\s+(?:self\.)?\w+$/u,
    /^(?:pass|\.\.\.)$/u,
    /^\w+: [^=]+(?:=.*)?$/u,
    /^super\(\)\.__init__\(.*\)$/u,
  ],
  kotlin: [
    BRACKETS_ONLY,
    /^@\w+(?:\(.*\))?$/u,
    new RegExp(
      `^${KOTLIN_MODIFIERS}(?:val|var)\\s+\\w+(?: ?: ${TYPE_TEXT})?(?: ?= ?[^({]*)?,?$`,
      'u',
    ),
    new RegExp(`^(?:(?:${KOTLIN_TYPES})\\s+)*(?:class|interface|object)\\s+\\w.*[({]?$`, 'u'),
    /^[A-Z][A-Z0-9_]*(?:\(.*\))?[,;]?$/u,
    /^return\s+\w+$/u,
    /^this\.\w+ = \w+$/u,
  ],
};

export function isBoilerplate(lines, syntax) {
  const patterns = PATTERNS[syntax];
  const code = lines
    .map((line) => line.replace(STRING, '""').trim().replace(LEADING_DECORATORS, ''))
    .filter((line) => line !== '');
  return code.length > 0 && code.every((line) => patterns.some((pattern) => pattern.test(line)));
}
