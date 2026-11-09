const MERGE_BRANCHES = 'Merge the branches into one: `case a, b:` or `if a || b`.';
const OWN_TYPE = 'Declare the inner struct as a named type of its own.';

const HINTS = new Map([
  ['bare-return', 'Name every value in the return statement: `return size, nil`.'],
  [
    'blank-imports',
    'Import the package for its side effect in the main package or a test that needs it.',
  ],
  ['call-to-gc', 'Remove the call; the runtime schedules garbage collection itself.'],
  ['comment-spacings', 'Put a space after `//`: `// text`.'],
  [
    'datarace',
    'Return the value from the goroutine over a channel, or assign it after the goroutine is joined.',
  ],
  ['deep-exit', 'Return an error and let main decide how the program exits.'],
  ['empty-block', 'Remove the block, or put the code it was meant to run in it.'],
  ['enforce-map-style', 'Write `map[K]V{}`; keep `make` only with a size: `make(map[K]V, n)`.'],
  ['enforce-slice-style', 'Write `[]T{}`, or `var items []T` for a nil slice.'],
  ['enforce-repeated-arg-type-style', 'Group the names: `first, second string`.'],
  ['enforce-switch-style', 'Move `default` to the end of the switch.'],
  [
    'filename-format',
    'Name the file in lower case with underscores between words: `order_items.go`.',
  ],
  ['flag-parameter', 'Split the function in two, one for each value of the flag.'],
  [
    'get-return',
    'Return the value, or name the function for what it does, such as `IncrementCount`.',
  ],
  ['identical-branches', 'Drop the condition and keep one copy of the code.'],
  ['identical-ifelseif-branches', MERGE_BRANCHES],
  ['identical-switch-branches', MERGE_BRANCHES],
  ['identical-switch-conditions', 'Remove the repeated case; only the first one can run.'],
  ['import-alias-naming', 'Use a lower-case alias of letters and digits: `runecount`.'],
  ['import-shadowing', 'Rename the variable so the package stays reachable.'],
  ['inefficient-map-lookup', 'Index the map: `_, found := values[key]`.'],
  [
    'modifies-value-receiver',
    'Use a pointer receiver, or copy the value into a local variable and change that.',
  ],
  [
    'multiline-if-init',
    'Assign before the `if` and test the result: `data, err := read(path)`, then `if err != nil`.',
  ],
  ['nested-structs', OWN_TYPE],
  [
    'package-directory-mismatch',
    'Name the package after its folder, or after the parent folder for a version folder such as `v2`.',
  ],
  [
    'package-naming',
    'Name the package for what it provides, such as `orders`, not `util` or a standard package name.',
  ],
  [
    'range-val-address',
    'Take the address of the element, `&values[index]`, or copy the value into a new variable first.',
  ],
  ['redefines-builtin-id', 'Rename the variable, such as `length` for `len`.'],
  ['redundant-import-alias', 'Drop the alias.'],
  ['unused-receiver', 'Leave the receiver unnamed, `func (Box) Name()`; ST1006 rejects `_`.'],
  ['unexported-return', 'Export the type, or return an exported interface it implements.'],
  ['useless-break', 'Remove the break; a case ends without it.'],
]);

const MESSAGE_HINTS = [
  [
    'defer',
    /chains of function calls/u,
    'Keep the returned function and defer that: `stop := start(); defer stop()`.',
  ],
  [
    'defer',
    /inside loops/u,
    'Move the loop body into a function, so each defer runs when it returns.',
  ],
];

export const REVIVE_VARYING_PARTS = new Map([
  ['identical-ifelseif-branches', / \(lines \d+ and \d+\)/u],
  ['identical-switch-branches', / \(lines \d+ and \d+\)/u],
  ['identical-switch-conditions', / at line \d+/u],
  ['package-directory-mismatch', / or parent directory name "[^"]*"/u],
]);

export function reviveHint(rule, message) {
  const match = MESSAGE_HINTS.find(([name, pattern]) => name === rule && pattern.test(message));
  return match === undefined ? HINTS.get(rule) : match[2];
}
