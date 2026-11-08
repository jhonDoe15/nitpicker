import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

function compiledSchema() {
  const schema = JSON.parse(
    readFileSync(new URL('../../../../spec/findings.schema.json', import.meta.url), 'utf8'),
  );
  return new Ajv2020({ strict: false, allErrors: true }).compile(schema);
}

/**
 * What `spec/findings.schema.json` refuses in a list of findings a run wrote (`new-findings.json`,
 * `findings.json`), one line per error with the finding's tool and rule; empty when it is valid.
 */
export function findingsSchemaErrors(findings) {
  const validate = compiledSchema();
  if (validate({ findings })) {
    return [];
  }
  return validate.errors.map(({ instancePath, message, params }) => {
    const index = /^\/findings\/(\d+)/u.exec(instancePath)?.[1];
    const finding = index === undefined ? undefined : findings[Number(index)];
    const named = finding === undefined ? '' : `${finding.tool} ${finding.rule}: `;
    return `${named}${instancePath} ${message} ${JSON.stringify(params)}`;
  });
}

/** `result` as it is, after checking its `newFindings` against the findings schema; throws on an error. */
export function schemaChecked(result) {
  const errors = findingsSchemaErrors(result.newFindings ?? []);
  if (errors.length > 0) {
    throw new Error(
      `The run wrote findings that spec/findings.schema.json refuses:\n${errors.join('\n')}`,
    );
  }
  return result;
}
