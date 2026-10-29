import Ajv from 'ajv';
import { expect } from 'vitest';
import official from './sarif-schema-2.1.0.json' with { type: 'json' };

const ABSOLUTE_URI = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/u;
const URI_REFERENCE = /^[^\s]*$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const body = Object.fromEntries(
  Object.entries(official).filter(([key]) => key !== '$schema' && key !== 'id'),
);
const validate = new Ajv({
  allErrors: true,
  strict: false,
  formats: { uri: ABSOLUTE_URI, 'uri-reference': URI_REFERENCE, 'date-time': DATE_TIME },
}).compile({ ...body, $id: official.id });

export function sarifSchemaErrors(log) {
  return validate(log) ? [] : validate.errors;
}

export function expectMatchesSarifSchema(log) {
  expect(sarifSchemaErrors(log), 'SARIF 2.1.0 schema violations').toEqual([]);
}
