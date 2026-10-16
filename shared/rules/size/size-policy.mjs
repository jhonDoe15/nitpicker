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

export const FOLDER_DEPTH_DEFAULTS = { typescript: 1, java: 4, python: 4 };

export const PYTHON_SIZE_RULES = Object.values(SIZE_RULE_IDS);

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

const PYTHON_ONLY = { typescript: false, java: false, python: true };

function pythonRule(withKotlin, id, limit) {
  return { id, check: 'structure', limit, enforcedBy: withKotlin(PYTHON_ONLY, false) };
}

/** The folder-files rule, then the folder depth and class limits, in catalog order. */
export function sizeRules({ all, withKotlin, folderFiles }) {
  return [
    {
      id: 'folder-files-limit',
      check: 'structure',
      limit: `more than ${String(folderFiles)} source files, or test files, directly in one folder; override with \`thresholds.folderFiles\``,
      enforcedBy: withKotlin(all, true),
    },
    pythonRule(
      withKotlin,
      SIZE_RULE_IDS.folderDepth,
      `code more than ${String(FOLDER_DEPTH_DEFAULTS.python)} packages below the top-level package (Python); override with \`thresholds.folderDepth\``,
    ),
    pythonRule(
      withKotlin,
      SIZE_RULE_IDS.classMethods,
      `more than ${String(CLASS_LIMIT_DEFAULTS.classMethods)} methods in a class of the Python source roots; override with \`thresholds.classMethods\``,
    ),
    pythonRule(
      withKotlin,
      SIZE_RULE_IDS.classFields,
      `more than ${String(CLASS_LIMIT_DEFAULTS.classFields)} instance fields in a class of the Python source roots; override with \`thresholds.classFields\``,
    ),
    pythonRule(
      withKotlin,
      SIZE_RULE_IDS.inheritanceDepth,
      `a class more than ${String(CLASS_LIMIT_DEFAULTS.inheritanceDepth)} superclasses deep in the Python source roots; override with \`thresholds.inheritanceDepth\``,
    ),
  ];
}
