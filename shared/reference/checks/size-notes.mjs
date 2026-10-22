const SPLIT_FIRST = 'A function, file or class already over its limit may be edited as long as the change does not make it worse.';

export const SIZE_NOTES = {
  'function-lines-limit': [
    'A function longer than the limit.',
    'Long functions hide several jobs in one place; agents grow them instead of splitting them.',
    `Split it into functions named for what each part does and put new code in a new function. ${SPLIT_FIRST}`,
  ],
  'function-statements-limit': [
    'A function with more statements than the limit.',
    'Many statements usually mean several responsibilities in one function.',
    `Split it by responsibility and name each part for what it checks or does. ${SPLIT_FIRST}`,
  ],
  'function-control-nesting-limit': [
    'A function that nests control flow deeper than the limit.',
    'Deep nesting makes the paths through a function hard to follow and to test.',
    'Return early instead of nesting, or move the nested part into its own function.',
  ],
  'function-parameters-limit': [
    'A function with more parameters than the limit.',
    'Long parameter lists are easy to call in the wrong order and tend to grow.',
    'Group related parameters into one object (an options object, a record or a data class) instead of adding another.',
  ],
  'file-lines-limit': [
    'A file longer than the limit (source and test files have separate limits).',
    'Long files collect unrelated responsibilities and are slow to review.',
    'Split the file by responsibility and put new code in a new file.',
  ],
  'line-length-limit': [
    'A line longer than the limit, except imports, URLs and the text of string literals.',
    'Long lines are hard to review in a diff and hide complexity.',
    'Break the line up or extract a named value; a formatter wraps what it can.',
  ],
  'folder-files-limit': [
    'A folder with more source files, or more test files, directly in it than the limit.',
    'A flat folder of many files has no structure for a reader to follow.',
    'Group related files into subfolders (packages in Java and Kotlin).',
  ],
  'folder-depth-limit': [
    'Code nested deeper below its feature folder or root package than the limit.',
    'Deep trees hide where code belongs and make imports long.',
    'Flatten the tree: move the code up to the feature or package that owns it.',
  ],
  'class-methods-limit': [
    'A class with more methods than the limit.',
    'A class with many methods usually has more than one responsibility.',
    'Split it into classes by responsibility.',
  ],
  'class-fields-limit': [
    'A class with more instance fields than the limit.',
    'Many fields mean a class holds state that belongs in separate types.',
    'Group related fields into a record or a class of their own.',
  ],
  'inheritance-depth-limit': [
    'A class that extends more superclasses than the limit.',
    'Deep inheritance spreads behaviour over many classes and couples them.',
    'Hold the shared part as a field and delegate to it instead of extending.',
  ],
};
