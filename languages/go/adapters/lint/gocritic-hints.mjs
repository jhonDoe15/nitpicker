const SWITCH = 'Write a switch: `switch { case a: ... case b: ... default: ... }`.';

export const GOCRITIC_HINTS = [
  ['appendAssign', 'Append to the slice you assign: `items = append(items, item)`.'],
  ['appendCombine', 'Pass every value to one call: `items = append(items, first, second)`.'],
  ['argOrder', 'Pass the string you search in first: `strings.HasPrefix(name, "#")`.'],
  ['badCall', 'Pass -1 for no limit, or call the function with the arguments it needs.'],
  ['badLock', 'Defer the matching unlock: `mu.Lock(); defer mu.Unlock()`.'],
  ['badRegexp', 'Escape the character, or list each character of the class once.'],
  [
    'badSyncOnceFunc',
    'Keep the result and call it: `setup := sync.OnceFunc(load)`, then `setup()`.',
  ],
  ['captLocal', 'Start local names with a lower-case letter.'],
  ['commentedOutCode', 'Delete the commented-out code; version control keeps it.'],
  ['docStub', 'Say what it does, or remove the comment.'],
  ['dupArg', 'Pass the other value the call needs, such as `copy(target, source)`.'],
  ['dupCase', 'Remove the repeated value, or fix the one that was meant.'],
  ['dupOption', 'Pass each option once.'],
  [
    'emptyFallthrough',
    'List the values in one case: `case a, b:`; drop a case that only falls into `default`.',
  ],
  ['emptyDecl', 'Remove the empty block.'],
  ['evalOrder', 'Call the function in a statement before the return.'],
  [
    'exitAfterDefer',
    'Move the deferred work into a function that returns an error, and let main only call `os.Exit`.',
  ],
  ['exposedSyncMutex', 'Keep the mutex in an unexported field: `mu sync.Mutex`.'],
  [
    'filepathJoin',
    'Pass each path element without separators: `filepath.Join(dir, "config.yaml")`.',
  ],
  ['flagName', 'Name the flag without spaces or a leading dash.'],
  ['hexLiteral', 'Write the hex digits in one case: `0xff` or `0xFF`.'],
  ['ifElseChain', SWITCH],
  ['initClause', 'Call it in a statement before the if; the init clause declares variables.'],
  ['mapKey', 'Remove the space from the key.'],
  ['ptrToRefParam', 'Pass the map, channel or interface itself; it already refers to shared data.'],
  ['rangeAppendAll', 'Append the element: `result = append(result, value)`.'],
  ['returnAfterHttpError', 'Return after `http.Error`.'],
  ['singleCaseSwitch', 'Write an if statement.'],
  ['sqlQuery', 'Use `ExecContext` for a statement that returns no rows.'],
  ['stringConcatSimplify', 'Join the parts with `+`.'],
  ['stringsCompare', 'Compare the strings with `==`, `<` or `>`.'],
  [
    'todoCommentWithoutDetail',
    'Say what is left to do: `// TODO: drop the copy once callers stop mutating it`.',
  ],
  ['typeAssertChain', 'Write a type switch: `switch typed := value.(type) { case string: ... }`.'],
  ['uncheckedInlineErr', 'Check the error the init clause declares: `if err := f(); err != nil`.'],
  ['unnecessaryBlock', 'Remove the braces.'],
  ['unnecessaryDefer', 'Call it directly; the function returns right after.'],
  ['weakCond', 'Check the length: `len(values) > 0 && values[0] == 10`.'],
];

export const GOCRITIC_MESSAGE_HINTS = [
  ['sortSlice', /^cmp func/u, 'Compare the elements of the slice you sort: `names[i] < names[j]`.'],
  [
    'sortSlice',
    /^unusual order/u,
    'Keep `i` on the left and flip the operator: `names[i] > names[j]` sorts in descending order.',
  ],
  [
    'unlabelStmt',
    /is redundant$/u,
    'Remove the label; the statement already applies to the innermost loop.',
  ],
];
