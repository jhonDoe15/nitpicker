import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isStale } from '../../../scripts/schema/gen-config-schema.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { KEYS } from '../validate.mjs';
import { SCHEMA_URL } from './config-schema.mjs';
import { documentedConfigs } from './test-support/doc-examples.mjs';
import {
  PRESETS,
  committedSchema,
  createValidator,
  schemaAccepts,
  schemaErrors,
  validatorAccepts,
  validatorError,
  withPreset,
} from './test-support/schema-harness.mjs';

function propertySchemas(node, trail = []) {
  if (typeof node !== 'object' || node === null) {
    return [];
  }
  const own = Object.entries(node.properties ?? {}).flatMap(([key, child]) => [
    [[...trail, key].join('.'), child],
    ...propertySchemas(child, [...trail, key]),
  ]);
  return [...own, ...propertySchemas(node.items, [...trail, '[]'])];
}

describe('config.schema.json', () => {
  it('is what npm run gen:schema writes from the validator definitions', async () => {
    expect(await isStale()).toBe(false);
  });

  it('is a draft-07 schema that Ajv compiles in strict mode', () => {
    expect(committedSchema().$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(() => createValidator()).not.toThrow();
  });

  it('has a property for every config key and the $schema line', () => {
    expect(Object.keys(committedSchema().properties)).toEqual(['$schema', ...KEYS]);
    expect(committedSchema().additionalProperties).toBe(false);
  });

  it('describes every property the editor offers', () => {
    const undescribed = propertySchemas(committedSchema())
      .filter(([, schema]) => typeof schema.description !== 'string')
      .map(([trail]) => trail);
    expect(undescribed).toEqual([]);
  });

  it('is shipped in the npm package', () => {
    const files = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).files;
    expect(
      ['spec/config.schema.json', 'spec/findings.schema.json'].filter(
        (file) => !files.includes(file),
      ),
    ).toEqual([]);
  });

  it('resolves through the package exports under the names the docs give', () => {
    const resolve = createRequire(import.meta.url).resolve;

    expect(
      [
        'nitpicker/config.schema.json',
        'nitpicker/spec/config.schema.json',
        'nitpicker/spec/findings.schema.json',
      ].map((specifier) => path.relative(PACKAGE_ROOT, resolve(specifier))),
    ).toEqual(['spec/config.schema.json', 'spec/config.schema.json', 'spec/findings.schema.json']);
  });
});

describe('an editor checking a nitpicker.config.json against the schema', () => {
  const sample = {
    $schema: './node_modules/nitpicker/spec/config.schema.json',
    preset: 'typescript',
    thresholds: { crapLimit: 12, fileLines: 400 },
    layout: { sourceRoots: ['lib'] },
    tools: { eslint: { engine: 'oxlint' }, prettier: { precedence: ['project', 'nitpicker'] } },
    exceptions: [
      {
        rule: 'file-lines-limit',
        paths: ['lib/legacy/**'],
        reason: 'Legacy module until the move',
      },
    ],
    conventions: { 'prettier.quotes': 'single' },
  };

  it('accepts a configuration both the schema and the validator accept', () => {
    expect(schemaErrors(sample)).toEqual([]);
    expect(validatorError(sample)).toBeUndefined();
  });

  it.each([
    ['a misspelled key', { thresold: { crapLimit: 1 } }],
    ['a misspelled preset', { preset: 'typescipt' }],
    ['a threshold of the wrong type', { thresholds: { fileLines: '400' } }],
    ['a key of another preset', { preset: 'java', react: { enabled: true } }],
    [
      'a tool of another preset',
      { preset: 'python', tools: { prettier: { precedence: ['project'] } } },
    ],
    [
      'an exception without a reason',
      { exceptions: [{ rule: 'file-lines-limit', paths: ['a.ts'] }] },
    ],
    ['an unknown convention', { conventions: { 'prettier.tabs': 'single' } }],
  ])('flags %s that the validator rejects too', (_name, config) => {
    expect(schemaAccepts(config)).toBe(false);
    expect(validatorAccepts(config)).toBe(false);
  });
});

describe('the configurations in the repository', () => {
  const tracked = execFileSync('git', ['ls-files', '*nitpicker.config.json'], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    timeout: 10_000,
  })
    .trim()
    .split('\n');

  it.each(tracked)('%s is valid for the schema and the validator', (file) => {
    const config = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, file), 'utf8'));
    expect(validatorError(config)).toBeUndefined();
    expect(schemaErrors(config)).toEqual([]);
  });

  it('includes the repository config and the fixture configs', () => {
    expect(tracked.includes('nitpicker.config.json')).toBe(true);
    expect(tracked.length).toBeGreaterThan(5);
  });
});

describe('the configurations in the documentation', () => {
  const examples = documentedConfigs();

  it('are found in the usage guide and in every preset guide', () => {
    const files = new Set(examples.map(({ file }) => file));
    expect(
      ['usage', 'java-preset', 'kotlin-preset', 'python-preset'].filter(
        (guide) => !files.has(`docs/${guide}.md`),
      ),
    ).toEqual([]);
  });

  it.each([
    ['usage', './node_modules/nitpicker/spec/config.schema.json'],
    ['typescript-strict-preset', './node_modules/nitpicker/spec/config.schema.json'],
    ['java-preset', SCHEMA_URL],
    ['kotlin-preset', SCHEMA_URL],
    ['python-preset', SCHEMA_URL],
  ])('the %s guide shows the $schema line', (guide, line) => {
    expect(readFileSync(path.join(PACKAGE_ROOT, 'docs', `${guide}.md`), 'utf8')).toContain(line);
  });

  it.each(examples.map((example) => [`${example.file}: ${example.text.slice(0, 60)}`, example]))(
    'agree and hold under some preset: %s',
    (_name, { config }) => {
      const valid = PRESETS.filter((preset) => validatorAccepts(withPreset(config, preset)));
      expect(valid.length).toBeGreaterThan(0);
      expect(
        PRESETS.filter(
          (preset) =>
            schemaAccepts(withPreset(config, preset)) !==
            validatorAccepts(withPreset(config, preset)),
        ),
      ).toEqual([]);
    },
  );
});
