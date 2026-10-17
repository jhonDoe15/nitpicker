import { createRuleTester } from '../../guards/test-support/rule-tester.mjs';
import { rule } from './no-unsafe-deserialization.mjs';

const tester = createRuleTester();
const code = (messageId, name) => [{ messageId, data: { name } }];
const legacy = [{ yamlMajor: 3 }];

tester.run('no-unsafe-deserialization with clones, versions and import forms', rule, {
  valid: [
    'import serialize from "serialize-to-js"; export const inline = (s: object) => `<script>window.__STATE__ = ${serialize(s)}</script>`;',
    'export const c = <T>(v: T) => structuredClone(v);',
    'import yaml from "js-yaml"; export const read = (t: string) => yaml.load(t);',
    {
      code: 'import yaml from "js-yaml"; export const read = (t: string) => yaml.safeLoad(t);',
      options: legacy,
    },
    {
      code: 'import yaml from "js-yaml"; export const read = (t: string) => yaml.load(t, { schema: yaml.JSON_SCHEMA });',
      options: legacy,
    },
    {
      code: 'import yaml from "js-yaml"; export const read = (t: string) => yaml.load(t);',
      options: [{ yamlMajor: 4 }],
    },
    'import yaml from "js-yaml"; export const write = (v: unknown) => yaml.dump(v, { schema: yaml.DEFAULT_SCHEMA });',
    'import yaml from "js-yaml"; const { CORE_SCHEMA } = yaml; export const read = (t: string) => yaml.load(t, { schema: CORE_SCHEMA });',
    'export { CORE_SCHEMA } from "js-yaml";',
  ],
  invalid: [
    {
      code: 'import v8 from "node:v8"; export const clone = <T>(value: T): T => v8.deserialize(v8.serialize(value)) as T;',
      errors: code('v8Clone', 'deserialize'),
    },
    {
      code: 'import { deserialize, serialize } from "node:v8"; export const clone = (value: unknown) => { const bytes = serialize(value); return deserialize(bytes); };',
      errors: code('v8Clone', 'deserialize'),
    },
    {
      code: 'import { deserialize } from "node:v8"; import { readFileSync } from "node:fs"; export const load = (f: string) => deserialize(readFileSync(f));',
      errors: code('v8Deserialize', 'deserialize'),
    },
    {
      code: 'import yaml from "js-yaml"; export const read = (t: string) => yaml.load(t);',
      options: legacy,
      errors: code('yamlLegacyLoad', 'load'),
    },
    {
      code: 'import { loadAll } from "js-yaml"; export const read = (t: string, each: (d: unknown) => void) => loadAll(t, each);',
      options: legacy,
      errors: code('yamlLegacyLoad', 'loadAll'),
    },
    {
      code: 'import ns = require("node-serialize"); export const r = (s: string) => ns.unserialize(s);',
      errors: code('rebuildsCode', 'node-serialize'),
    },
    {
      code: 'export const r = async (s: string) => { const ns = await import("node-serialize"); return ns.unserialize(s); };',
      errors: code('rebuildsCode', 'node-serialize'),
    },
    {
      code: 'import yaml from "js-yaml"; const { DEFAULT_FULL_SCHEMA } = yaml; export const r = (t: string) => yaml.load(t, { schema: DEFAULT_FULL_SCHEMA });',
      errors: code('yamlFullSchema', 'DEFAULT_FULL_SCHEMA'),
    },
    {
      code: 'export { DEFAULT_FULL_SCHEMA } from "js-yaml";',
      errors: code('yamlFullSchema', 'DEFAULT_FULL_SCHEMA'),
    },
    {
      code: 'import * as vm from "node:vm"; const sandbox = vm; export const run = (code: string) => sandbox.runInNewContext(code);',
      errors: code('runsText', 'vm.runInNewContext'),
    },
  ],
});
