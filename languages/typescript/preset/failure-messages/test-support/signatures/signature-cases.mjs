import { strictSyntaxConfig } from '../../../eslint-config/strict.mjs';

function syntaxCase([name, banned, allowed]) {
  return { name, config: strictSyntaxConfig, filename: 'src/fixture.ts', banned, allowed };
}

export function signatureFailureMessageCases({ typedConfig, typedFile }) {
  return [
    ...[
      [
        'optional boolean parameter names the required boolean',
        'export function run(force?: boolean) { return force; }',
        'required `boolean`',
      ],
      [
        'boolean or undefined names a union of string literals',
        'export type Options = { force: boolean | undefined };',
        "'on' | 'off' | 'auto'",
      ],
      [
        'deprecated doc tag names deleting the old API',
        '/** @deprecated use load */\nexport function fetchUser() { return 1; }',
        'update its callers to the replacement',
      ],
      [
        'second exported name names the single name',
        'export function load() { return 1; }\nexport const fetchUser = load;',
        'update its callers to import `load`',
      ],
    ].map(syntaxCase),
    ...[
      [
        'mutating a parameter array names the new value',
        'export function add(items: string[], item: string) { items.push(item); }',
        '[...items, item]',
      ],
      [
        'writing a parameter index names the copy',
        'export function put(items: string[]) { items[0] = "x"; }',
        'const copy = [...items]',
      ],
      [
        'logical or on a nullable names nullish coalescing',
        'export function pick(name: string | undefined) { return name || "none"; }',
        'nullish coalescing',
      ],
    ].map(([name, banned, allowed]) => ({
      name,
      config: typedConfig,
      filename: typedFile,
      banned,
      allowed,
    })),
  ];
}
