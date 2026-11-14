import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { fieldOf, fieldsOf, textOf } from '../../../../shared/values/readers.mts';

const ajv = new Ajv2020({ strict: false, allErrors: true });

function compiledSchema() {
  const schema: unknown = JSON.parse(
    readFileSync(new URL('../../../../spec/findings.schema.json', import.meta.url), 'utf8'),
  );
  return ajv.getSchema(textOf(fieldOf(schema, '$id'))) ?? ajv.compile(fieldsOf(schema));
}

export function findingsSchemaErrors(findings: readonly unknown[]): string[] {
  const validate = compiledSchema();
  if (validate({ findings }) === true) {
    return [];
  }
  return (validate.errors ?? []).map(({ instancePath, message, params }) => {
    const index = /^\/findings\/(\d+)/u.exec(instancePath)?.[1];
    const finding = index === undefined ? undefined : findings[Number(index)];
    const { tool, rule } = fieldsOf(finding);
    const named = finding === undefined ? '' : `${textOf(tool)} ${textOf(rule)}: `;
    return `${named}${instancePath} ${textOf(message)} ${JSON.stringify(params)}`;
  });
}

export function schemaAccepts(findings: readonly unknown[]): boolean {
  return findingsSchemaErrors(findings).length === 0;
}

type Checked = { readonly newFindings?: readonly unknown[] };

export function schemaChecked(result: Checked): Checked {
  const errors = findingsSchemaErrors(result.newFindings ?? []);
  if (errors.length > 0) {
    throw new Error(
      `The run wrote findings that spec/findings.schema.json refuses:\n${errors.join('\n')}`,
    );
  }
  return result;
}
