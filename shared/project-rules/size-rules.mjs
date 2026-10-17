export const FILE_RULE_IDS = {
  fileLines: 'file-lines-limit',
  lineLength: 'line-length-limit',
  folderFiles: 'folder-files-limit',
};

export const SIZE_RULE_IDS = {
  folderDepth: 'folder-depth-limit',
  classMethods: 'class-methods-limit',
  classFields: 'class-fields-limit',
  inheritanceDepth: 'inheritance-depth-limit',
};

export const FILE_LIMIT_DEFAULTS = {
  fileLines: 300,
  testFileLines: 500,
  lineLength: 120,
  folderFiles: 6,
};

export const CLASS_LIMIT_DEFAULTS = {
  classMethods: 20,
  classFields: 10,
  inheritanceDepth: 3,
};

export const FOLDER_DEPTH_DEFAULTS = { typescript: 1, java: 4, python: 4 };

export const JAVA_SIZE_RULES = Object.values(SIZE_RULE_IDS);

export const TYPESCRIPT_SIZE_RULES = [SIZE_RULE_IDS.folderDepth];

export const PYTHON_SIZE_RULES = Object.values(SIZE_RULE_IDS);

export const JAVA_LINE_LENGTH = 100;

export function sizeMessages(hint) {
  return {
    fileLines: `File has {value} lines (limit {limit}). Split it into files by responsibility. ${hint}`,
    lineLength: `Line is {value} characters (limit {limit}). Break it up or extract a named value. ${hint}`,
    folderFiles: `Folder has {value} {kind} files directly in it (limit {limit}). Group related files into subfolders (packages in Java). ${hint}`,
    folderDepth: `{subject} is {value} levels below {below} (limit {limit}). {advice} ${hint}`,
    classMethods: `{name} has {value} methods (limit {limit}). Split it into classes by responsibility. ${hint}`,
    classFields: `{name} has {value} fields (limit {limit}). Group related fields into a record or a class of their own. ${hint}`,
    recordComponents: `{name} has {value} components (limit {limit}). Group related components into nested records, or split the record by responsibility. ${hint}`,
    inheritanceDepth: `{name} extends {value} classes deep (limit {limit}). Hold the shared part as a field and delegate to it instead of extending. ${hint}`,
  };
}

export function sizeGrewMessages(hint) {
  return {
    fileLines: `File grew from {base} to {value} lines (limit {limit}). Put new code in a new file. ${hint}`,
    lineLength: `Line grew from {base} to {value} characters (limit {limit}). Break it up or extract a named value. ${hint}`,
    folderFiles: `Folder grew from {base} to {value} {kind} files (limit {limit}). Put the new file in a subfolder. ${hint}`,
    folderDepth: `{subject} grew from {base} to {value} levels below {below} (limit {limit}). {advice} ${hint}`,
    classMethods: `{name} grew from {base} to {value} methods (limit {limit}). Put the new method in a new class. ${hint}`,
    classFields: `{name} grew from {base} to {value} fields (limit {limit}). Put the new field in a new class, or group it with related fields in a record. ${hint}`,
    recordComponents: `{name} grew from {base} to {value} components (limit {limit}). Put the new component in a nested record, or split the record by responsibility. ${hint}`,
    inheritanceDepth: `{name} now extends {value} classes deep, up from {base} (limit {limit}). Hold the shared part as a field and delegate to it instead of extending. ${hint}`,
  };
}

export const SIZE_HELD_MESSAGES = {
  fileLines:
    'File: {value} lines (limit {limit}), allowed because base was {base}; any increase fails.',
  lineLength:
    'Line: {value} characters (limit {limit}), allowed because base was {base}; any increase fails.',
  folderFiles:
    'Folder: {value} {kind} files (limit {limit}), allowed because base was {base}; any increase fails.',
  folderDepth:
    '{subject}: {value} levels below {below} (limit {limit}), allowed because base was {base}; any increase fails.',
  classMethods:
    '{name}: {value} methods (limit {limit}), allowed because base was {base}; any increase fails.',
  classFields:
    '{name}: {value} fields (limit {limit}), allowed because base was {base}; any increase fails.',
  recordComponents:
    '{name}: {value} components (limit {limit}), allowed because base was {base}; any increase fails.',
  inheritanceDepth:
    '{name}: extends {value} classes deep (limit {limit}), allowed because base was {base}; any increase fails.',
};

function fileRules(enforcedBy) {
  return [
    {
      id: FILE_RULE_IDS.fileLines,
      check: 'structure',
      limit: `more than ${String(FILE_LIMIT_DEFAULTS.fileLines)} lines in a source file or ${String(FILE_LIMIT_DEFAULTS.testFileLines)} in a test file; override with \`thresholds.fileLines\` and \`thresholds.testFileLines\``,
      enforcedBy,
    },
    {
      id: FILE_RULE_IDS.lineLength,
      check: 'structure',
      limit: `a line longer than ${String(FILE_LIMIT_DEFAULTS.lineLength)} characters, except imports, URLs and string literal text; override with \`thresholds.lineLength\` (Java files: ${String(JAVA_LINE_LENGTH)} characters, which google-java-format wraps at, not configurable; Kotlin files: detekt's)`,
      enforcedBy,
    },
    {
      id: FILE_RULE_IDS.folderFiles,
      check: 'structure',
      limit: `more than ${String(FILE_LIMIT_DEFAULTS.folderFiles)} source files, or test files, directly in one folder; override with \`thresholds.folderFiles\``,
      enforcedBy,
    },
  ];
}

const TYPESCRIPT_DEPTH = `code more than ${String(FOLDER_DEPTH_DEFAULTS.typescript)} folder below \`features/<feature>/<layer>/\` (TypeScript)`;
const JAVA_DEPTH = `more than ${String(FOLDER_DEPTH_DEFAULTS.java)} packages below the root package (Java, Kotlin)`;
const PYTHON_DEPTH = `more than ${String(FOLDER_DEPTH_DEFAULTS.python)} packages below the root package (Python)`;

const JAVA_AND_PYTHON = { typescript: false, java: true, python: true };

function classRule(id, limit, withKotlin) {
  return { id, check: 'structure', limit, enforcedBy: withKotlin(JAVA_AND_PYTHON, true) };
}

export function sizeRules({ all, withKotlin }) {
  return [
    ...fileRules(withKotlin(all, true)),
    {
      id: SIZE_RULE_IDS.folderDepth,
      check: 'structure',
      limit: `${TYPESCRIPT_DEPTH}, ${JAVA_DEPTH} or ${PYTHON_DEPTH}; override with \`thresholds.folderDepth\``,
      enforcedBy: withKotlin(all, true),
    },
    classRule(
      SIZE_RULE_IDS.classMethods,
      `more than ${String(CLASS_LIMIT_DEFAULTS.classMethods)} methods in a class of the main Java sources or the Python source roots; override with \`thresholds.classMethods\``,
      withKotlin,
    ),
    classRule(
      SIZE_RULE_IDS.classFields,
      `more than ${String(CLASS_LIMIT_DEFAULTS.classFields)} instance fields in a class of the main Java sources or the Python source roots; override with \`thresholds.classFields\``,
      withKotlin,
    ),
    classRule(
      SIZE_RULE_IDS.inheritanceDepth,
      `a class more than ${String(CLASS_LIMIT_DEFAULTS.inheritanceDepth)} superclasses deep in the main Java sources or the Python source roots; override with \`thresholds.inheritanceDepth\``,
      withKotlin,
    ),
  ];
}
