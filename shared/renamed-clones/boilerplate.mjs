const STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu;
const LEADING_DECORATORS = /^(?:@\w+(?:\([^)]*\))?\s+)+(?=\S)/u;
const BRACKETS_ONLY = /^[{}()[\],;]*$/u;
const KOTLIN_MODIFIERS =
  '(?:(?:public|private|protected|internal|override|open|abstract|const|lateinit)\\s+)*';
const TYPE_TEXT = String.raw`[\w<>?,. [\]]+`;
const TS_MODIFIERS = String.raw`(?:(?:public|private|protected|static|readonly)\s+)*`;
const KOTLIN_TYPES = 'data|sealed|open|abstract|enum|annotation|inline|value|private|internal';
const JAVA_MODIFIERS =
  '(?:(?:public|private|protected|static|final|abstract|transient|volatile|default)\\s+)*';
const JAVA_TYPE = String.raw`[\w<>?.[\]]+(?:, ?[\w<>?.[\]]+)*`;
const GO_TYPE = String.raw`[\w.*[\]]+`;
const GO_RECEIVER = String.raw`(?:\(\w+ \*?\w+(?:\[[\w, ]+\])?\) )?`;

const PATTERNS = {
  typescript: [
    BRACKETS_ONLY,
    /^@\w+(?:\(.*\))?$/u,
    /^return\s+(?:this\.)?\w+;?$/u,
    /^this\.\w+ = \w+;?$/u,
    new RegExp(`^${TS_MODIFIERS}(?:override\\s+)?\\w+\\??: [^=]+$`, 'u'),
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
    /^[A-Z][A-Z0-9_]* = .+$/u,
  ],
  kotlin: [
    BRACKETS_ONLY,
    /^@\w+(?:\(.*\))?$/u,
    new RegExp(
      `^${KOTLIN_MODIFIERS}(?:val|var)\\s+\\w+(?: ?: ${TYPE_TEXT})?(?: ?=[^({]*)?,?$`,
      'u',
    ),
    new RegExp(`^${KOTLIN_MODIFIERS}(?:val|var)\\s+\\w+ ?: ${TYPE_TEXT}=.+,$`, 'u'),
    new RegExp(`^(?:(?:${KOTLIN_TYPES})\\s+)*(?:class|interface|object)\\s+\\w.*$`, 'u'),
    /^[A-Z][A-Z0-9_]*(?:\(.*\))?[,;]?$/u,
    /^return\s+\w+$/u,
    /^this\.\w+ = \w+$/u,
  ],
  java: [
    BRACKETS_ONLY,
    /^@[\w.]+(?:\(.*\))?$/u,
    /^(?:package|import)\s.+;$/u,
    new RegExp(`^${JAVA_MODIFIERS}${JAVA_TYPE} \\w+(?: = [^(]*)?;$`, 'u'),
    new RegExp(
      `^${JAVA_MODIFIERS}(?:${JAVA_TYPE} )?\\w+\\([^)]*\\)(?: throws [\\w., ]+)? ?\\{$`,
      'u',
    ),
    new RegExp(`^${JAVA_MODIFIERS}(?:class|interface|enum|record)\\s+\\w.*\\{$`, 'u'),
    /^return\s+(?:this\.)?\w+;$/u,
    /^this\.\w+ = \w+;$/u,
    /^super\([^)]*\);$/u,
    /^[A-Z][A-Z0-9_]*(?:\(.*\))?[,;]?$/u,
  ],
  go: [
    BRACKETS_ONLY,
    /^(?:package|import)\s.+$/u,
    /^(?:\w+ |\. )?""$/u,
    /^if err != nil \{$/u,
    /^return (?:\w+, )*(?:err|nil)$/u,
    /^return (?:\w+\.)?\w+$/u,
    /^return &?[\w.]+\{$/u,
    /^\}, (?:nil|err)$/u,
    /^\w+\.\w+ = \w+$/u,
    /^\w+: +\w+,$/u,
    new RegExp(`^\\w+(?:, \\w+)* +${GO_TYPE}(?: +\x60[^\x60]*\x60)?$`, 'u'),
    new RegExp(`^func ${GO_RECEIVER}\\w+\\(.*\\)(?: .+)? \\{$`, 'u'),
    /^type \w+(?:\[.*\])? (?:struct|interface) \{$/u,
  ],
};

export function isBoilerplate(lines, syntax) {
  const patterns = PATTERNS[syntax];
  const code = lines
    .map((line) => line.replace(STRING, '""').trim().replace(LEADING_DECORATORS, ''))
    .filter((line) => line !== '');
  return code.length > 0 && code.every((line) => patterns.some((pattern) => pattern.test(line)));
}
