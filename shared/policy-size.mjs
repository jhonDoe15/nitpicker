export const SIZE_RULE_IDS = {
  folderDepth: 'folder-depth-limit',
  classMethods: 'class-methods-limit',
  classFields: 'class-fields-limit',
  inheritanceDepth: 'inheritance-depth-limit',
};

export const CLASS_LIMIT_DEFAULTS = {
  classMethods: 20,
  classFields: 10,
  inheritanceDepth: 3,
};

export const FOLDER_DEPTH_DEFAULTS = { typescript: 1, java: 4 };

export const JAVA_SIZE_RULES = Object.values(SIZE_RULE_IDS);

export const TYPESCRIPT_SIZE_RULES = [SIZE_RULE_IDS.folderDepth];

export const JAVA_LINE_LENGTH = 100;

export function sizeMessages(hint) {
  return {
    folderDepth: `{subject} is {value} levels below {below} (limit {limit}). {advice} ${hint}`,
    classMethods: `{name} has {value} methods (limit {limit}). Split it into classes by responsibility. ${hint}`,
    classFields: `{name} has {value} fields (limit {limit}). Group related fields into a record or a class of their own. ${hint}`,
    recordComponents: `{name} has {value} components (limit {limit}). Group related components into nested records, or split the record by responsibility. ${hint}`,
    inheritanceDepth: `{name} extends {value} classes deep (limit {limit}). Hold the shared part as a field and delegate to it instead of extending. ${hint}`,
  };
}

export function sizeGrewMessages(hint) {
  return {
    folderDepth: `{subject} grew from {base} to {value} levels below {below} (limit {limit}). {advice} ${hint}`,
    classMethods: `{name} grew from {base} to {value} methods (limit {limit}). Put the new method in a new class. ${hint}`,
    classFields: `{name} grew from {base} to {value} fields (limit {limit}). Put the new field in a new class, or group it with related fields in a record. ${hint}`,
    recordComponents: `{name} grew from {base} to {value} components (limit {limit}). Put the new component in a nested record, or split the record by responsibility. ${hint}`,
    inheritanceDepth: `{name} now extends {value} classes deep, up from {base} (limit {limit}). Hold the shared part as a field and delegate to it instead of extending. ${hint}`,
  };
}

export const SIZE_HELD_MESSAGES = {
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

export function sizeRules({ both, withKotlin }) {
  const javaOnly = { typescript: false, java: true, python: false };
  const classRule = (id, limit) => ({
    id,
    check: 'structure',
    limit,
    enforcedBy: withKotlin(javaOnly, true),
  });
  return [
    {
      id: SIZE_RULE_IDS.folderDepth,
      check: 'structure',
      limit: `code more than ${String(FOLDER_DEPTH_DEFAULTS.typescript)} folder below \`features/<feature>/<layer>/\` (TypeScript) or more than ${String(FOLDER_DEPTH_DEFAULTS.java)} packages below the root package (Java, Kotlin); override with \`thresholds.folderDepth\``,
      enforcedBy: withKotlin(both, true),
    },
    classRule(
      SIZE_RULE_IDS.classMethods,
      `more than ${String(CLASS_LIMIT_DEFAULTS.classMethods)} methods in a class of the main Java sources; override with \`thresholds.classMethods\``,
    ),
    classRule(
      SIZE_RULE_IDS.classFields,
      `more than ${String(CLASS_LIMIT_DEFAULTS.classFields)} instance fields in a class of the main Java sources; override with \`thresholds.classFields\``,
    ),
    classRule(
      SIZE_RULE_IDS.inheritanceDepth,
      `a class more than ${String(CLASS_LIMIT_DEFAULTS.inheritanceDepth)} superclasses deep in the main Java sources; override with \`thresholds.inheritanceDepth\``,
    ),
  ];
}
