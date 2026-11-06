import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import { withCanonicalRules } from '../../../../shared/exceptions/validation.mjs';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import { validateConfig } from '../../validate.mjs';

const SCHEMA_PATH = path.join(PACKAGE_ROOT, 'spec', 'config.schema.json');

export const PRESETS = [undefined, 'typescript', 'javascript', 'java', 'kotlin', 'python', 'go'];

export function committedSchema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
}

export function createValidator(schema = committedSchema()) {
  const ajv = new Ajv({
    strict: true,
    strictTypes: false,
    strictTuples: false,
    strictRequired: false,
    allErrors: true,
  });
  return ajv.compile(schema);
}

const compiled = createValidator();

export function schemaErrors(config) {
  return compiled(config)
    ? []
    : compiled.errors.map(({ instancePath, message }) => `${instancePath} ${message}`);
}

export function schemaAccepts(config) {
  return schemaErrors(config).length === 0;
}

export function validatorError(config) {
  try {
    validateConfig(withCanonicalRules(structuredClone(config)));
    return undefined;
  } catch (error) {
    return error.message;
  }
}

export function validatorAccepts(config) {
  return validatorError(config) === undefined;
}

export function withPreset(config, preset) {
  return preset === undefined ? config : { preset, ...config };
}
