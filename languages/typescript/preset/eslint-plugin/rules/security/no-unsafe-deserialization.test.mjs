import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule as noUnsafeDeserialization } from './no-unsafe-deserialization.mjs';

const tester = createRuleTester();
const code = (messageId, name) => [{ messageId, data: { name } }];

tester.run('no-unsafe-deserialization', noUnsafeDeserialization, {
  valid: [
    'export const data = JSON.parse(text);',
    'import yaml from "js-yaml"; export const data = yaml.load(text);',
    'import { load, JSON_SCHEMA } from "js-yaml"; export const data = load(text, { schema: JSON_SCHEMA });',
    'import vm from "node:vm"; export const two = vm.runInNewContext("1 + 1");',
    'import vm from "node:vm"; const SOURCE = "1 + 1"; export const two = vm.runInThisContext(SOURCE);',
    'import v8 from "node:v8"; export const bytes = v8.serialize(value);',
    'import { deserialize } from "other-lib"; export const data = deserialize(bytes);',
    'export const run = (script) => script.runInNewContext(sandbox);',
    'export const options = { evalFunctions: false };',
    'export const options = { noent: false };',
    'import serialize from "serialize-javascript"; export const text = serialize(value);',
    'export const options = { promoteLongs: true };',
  ],
  invalid: [
    {
      code: 'import { unserialize } from "node-serialize"; export const data = unserialize(text);',
      errors: code('rebuildsCode', 'node-serialize'),
    },
    {
      code: 'const serialize = require("node-serialize"); exports.data = serialize.unserialize(text);',
      errors: code('rebuildsCode', 'node-serialize'),
    },
    {
      code: 'import Funcster from "funcster"; export const data = Funcster.deepDeserialize(text);',
      errors: code('rebuildsCode', 'funcster'),
    },
    {
      code: 'import v8 from "node:v8"; export const data = v8.deserialize(bytes);',
      errors: code('v8Deserialize', 'deserialize'),
    },
    {
      code: 'import { deserialize as read } from "v8"; export const data = read(bytes);',
      errors: code('v8Deserialize', 'deserialize'),
    },
    {
      code: 'import * as v8 from "node:v8"; export const reader = new v8.Deserializer(bytes);',
      errors: code('v8Deserialize', 'Deserializer'),
    },
    {
      code: 'import vm from "node:vm"; export const run = (code) => vm.runInNewContext(code, {});',
      errors: code('runsText', 'vm.runInNewContext'),
    },
    {
      code: 'import { runInThisContext } from "vm"; export const run = (code) => runInThisContext(`(${code})`);',
      errors: code('runsText', 'vm.runInThisContext'),
    },
    {
      code: 'import vm from "node:vm"; export const script = (code) => new vm.Script(code);',
      errors: code('runsText', 'vm.Script'),
    },
    {
      code: 'import vm from "node:vm"; export const fn = (body) => vm.compileFunction(body, ["x"]);',
      errors: code('runsText', 'vm.compileFunction'),
    },
    {
      code: 'import vm from "node:vm"; export const run = () => vm.runInNewContext();',
      errors: code('runsText', 'vm.runInNewContext'),
    },
    {
      code: 'import yaml from "js-yaml"; export const data = yaml.load(text, { schema: yaml.DEFAULT_FULL_SCHEMA });',
      errors: code('yamlFullSchema', 'DEFAULT_FULL_SCHEMA'),
    },
    {
      code: 'import { load, FULL_SCHEMA } from "js-yaml"; export const data = load(text, { schema: FULL_SCHEMA });',
      errors: code('yamlFullSchema', 'FULL_SCHEMA'),
    },
    {
      code: 'import { deserialize } from "bson"; export const doc = deserialize(bytes, { evalFunctions: true });',
      errors: code('bsonFunctions', 'evalFunctions'),
    },
    {
      code: 'import libxmljs from "libxmljs"; export const doc = libxmljs.parseXml(xml, { noent: true });',
      errors: code('entityExpansion', 'noent'),
    },
  ],
});
