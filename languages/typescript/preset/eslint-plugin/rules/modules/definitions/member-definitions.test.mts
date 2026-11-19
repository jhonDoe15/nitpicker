import { configuredRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../report-module-load-effects.mts';

const filename = '/repo/lib/document.js';
const expression = [{ messageId: 'topLevelExpression' }];

const valid = [
  [
    "'use strict';",
    'function Document(model) { this.model = model; }',
    'Document.prototype.update = function update(args) { return this.model.update(args); };',
  ].join('\n'),
  'function Shape() {}\nShape.prototype.area = () => 0;',
  'function Shape() {}\nShape.prototype = { constructor: Shape, area() { return 0; }, sides: 0 };',
  'function Shape() {}\nShape.prototype.kind = "shape";',
  'function Shape() {}\nShape.prototype.size = Shape.prototype.area = function area() { return 0; };',
  'function Shape() {}\nShape.prototype.measure = Shape.prototype.area;',
  'function Shape() {}\nShape.prototype.constructor = Shape;',
  'function Shape() {}\nShape.create = function create() { return new Shape(); };',
  'class Shape {}\nShape.Inner = class Inner {};',
  'const Shape = function Shape() {};\nShape.prototype.area = function area() { return 0; };',
  'function Shape() {}\nShape.prototype[Symbol.iterator] = function* iterate() {};',
  'function Shape() {}\nShape.prototype["area"] = function area() { return 0; };',
  'function Shape() {}\nObject.assign(Shape.prototype, { area() { return 0; } });',
  [
    'function Shape() {}',
    "Object.defineProperty(Shape.prototype, 'area', { get() { return 0; }, enumerable: true });",
  ].join('\n'),
  'var app = exports = module.exports = {};\napp.init = function init() { this.cache = {}; };',
  "var req = Object.create(require('http').IncomingMessage.prototype);\nreq.get = function get() {};",
].map((code) => ({ filename, code }));

const invalid = [
  'Array.prototype.last = function last() { return this[this.length - 1]; };',
  "const http = require('http');\nhttp.ServerResponse.prototype.json = function json() {};",
  "import { Model } from './model.js';\nModel.prototype.save = function save() {};",
  'function Shape() {}\nShape.prototype.area = compute();',
  'function Shape() {}\nShape.prototype.area = { value: load() };',
  'function Shape() {}\nShape.prototype[key()] = function area() { return 0; };',
  'function Shape() {}\nShape.prototype.area += 1;',
  'function Shape() {}\nObject.assign(Shape.prototype, mixin());',
  'function Shape() {}\nObject.assign(Other.prototype, { area() { return 0; } });',
  'function Shape() {}\nShape.prototype.size = registry.size = function size() {};',
  'const app = express();\napp.get = function get() {};',
  'function build() { function Inner() {} return Inner; }\nconst Shape = build();\nShape.prototype.a = function a() {};',
].map((code) => ({ filename, code, errors: expression }));

configuredRuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
}).run('report-module-load-effects for member definitions in CommonJS', rule, {
  valid,
  invalid: invalid.filter(({ code }) => !code.startsWith('import')),
});

configuredRuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
}).run('report-module-load-effects for member definitions in ES modules', rule, {
  valid: valid
    .filter(({ code }) => !(code.includes('exports') || code.includes('require')))
    .map((entry) => ({ ...entry, filename: '/repo/src/shape.mjs' })),
  invalid: invalid
    .filter(({ code }) => !code.includes('require'))
    .map((entry) => ({ ...entry, filename: '/repo/src/shape.mjs' })),
});
