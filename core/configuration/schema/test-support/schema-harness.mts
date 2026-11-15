import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Ajv, type ValidateFunction } from 'ajv';
import { withCanonicalRules } from '../../../../shared/exceptions/validation.mjs';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import { validateConfig } from '../../validate.mts';
import { fieldOf, fieldsOf, parseJson, textOf } from '../../../../shared/values/readers.mts';

const SCHEMA_PATH = path.join(PACKAGE_ROOT, 'spec', 'config.schema.json');

export const PRESETS = [undefined, 'typescript', 'javascript', 'java', 'kotlin', 'python', 'go'];

export function committedSchema(): Readonly<Record<string, unknown>> {
  return fieldsOf(parseJson(readFileSync(SCHEMA_PATH, 'utf8')));
}

export function createValidator(schema = committedSchema()): ValidateFunction {
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

export function schemaErrors(config: unknown): string[] {
  return compiled(config)
    ? []
    : (compiled.errors ?? []).map(
        ({ instancePath, message }) => `${instancePath} ${String(message)}`,
      );
}

export function schemaAccepts(config: unknown): boolean {
  return schemaErrors(config).length === 0;
}

export function validatorError(config: unknown): string | undefined {
  try {
    validateConfig(withCanonicalRules(structuredClone(config)));
    return undefined;
  } catch (error) {
    return textOf(fieldOf(error, 'message'));
  }
}

export function validatorAccepts(config: unknown): boolean {
  return validatorError(config) === undefined;
}

export function withPreset(config: object, preset: string | undefined): object {
  return preset === undefined ? config : { preset, ...config };
}
