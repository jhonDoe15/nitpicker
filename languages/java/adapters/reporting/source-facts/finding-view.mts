import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';

export type Finding = {
  readonly tool?: unknown;
  readonly rule?: unknown;
  readonly path?: unknown;
  readonly message?: unknown;
  readonly location?: { readonly line?: unknown } | undefined;
  readonly variable?: string | undefined;
  readonly owner?: string | undefined;
  readonly field?: string | undefined;
};

function simpleClass(name: string): string {
  return name.split('.').at(-1)?.split('$').at(-1) ?? name;
}

function logicalOf(result: unknown, kind: string): string | undefined {
  const locations = listOf(fieldOf(listOf(fieldOf(result, 'locations'))[0], 'logicalLocations'));
  const found = locations.find((location) => fieldOf(location, 'kind') === kind);
  const name = fieldOf(found, 'name');
  return typeof name === 'string' ? name : undefined;
}

function sarifView(result: unknown): Finding {
  const args = listOf(fieldOf(fieldOf(result, 'message'), 'arguments')).map((value) =>
    textOf(value),
  );
  const physical = fieldOf(listOf(fieldOf(result, 'locations'))[0], 'physicalLocation');
  const rule = textOf(fieldOf(result, 'ruleId'));
  const member = logicalOf(result, 'member');
  const qualified = rule.startsWith('UWF_') ? args[0] : undefined;
  const dotted = qualified ?? member;
  const owner =
    dotted === undefined ? undefined : simpleClass(dotted.split('.').slice(0, -1).join('.'));
  return {
    tool: 'spotbugs',
    rule,
    path: fieldOf(fieldOf(physical, 'artifactLocation'), 'uri'),
    location: { line: fieldOf(fieldOf(physical, 'region'), 'startLine') },
    variable: logicalOf(result, 'variable') ?? args[0],
    owner,
    field: dotted?.split('.').at(-1),
  };
}

export function viewOf(value: unknown): Finding {
  if (typeof fieldOf(value, 'ruleId') === 'string') {
    return sarifView(value);
  }
  const location = fieldOf(value, 'location');
  return {
    tool: fieldOf(value, 'tool'),
    rule: fieldOf(value, 'rule'),
    path: fieldOf(value, 'path'),
    message: fieldOf(value, 'message'),
    location: { line: fieldOf(location, 'line') },
  };
}
