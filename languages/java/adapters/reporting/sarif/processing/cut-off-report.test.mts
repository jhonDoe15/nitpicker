import { describe, expect, it } from 'vitest';
import { cutOffSarifReport } from './cut-off-report.mts';
import { fieldOf } from '../../../../../../shared/values/readers.mts';

function messageTextOf(report: string | undefined): unknown {
  const runs: unknown = fieldOf(JSON.parse(report ?? '{}'), 'runs');
  const invocations: unknown = fieldOf(fieldOf(runs, '0'), 'invocations');
  const notifications: unknown = fieldOf(fieldOf(invocations, '0'), 'toolExecutionNotifications');
  return fieldOf(fieldOf(fieldOf(notifications, '0'), 'message'), 'text');
}

const HEAD =
  '{\n  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",\n  "version": "2.1.0",\n  "runs": [\n    {\n' +
  '      "results": [{ "ruleId": "EmptyCatchBlock" }],\n      "invocations": [\n        {\n' +
  '          "executionSuccessful": false,\n          "toolExecutionNotifications": [\n';
const LOCATION =
  '            {\n              "locations": [{ "physicalLocation": { "artifactLocation": { "uri": "file:///p/A.java" } } }],\n';
const CUT_MESSAGE =
  '              "message": {\n                "text": "StringIndexOutOfBoundsException\\nString HALF = \\"';

describe('a PMD report that was cut off while writing a processing error', () => {
  it('keeps the results and the error up to the cut, reading the last copy of the report', () => {
    const cut = `${HEAD}${LOCATION}${CUT_MESSAGE}`;
    const repaired = cutOffSarifReport(`${cut}${cut}`);

    expect(JSON.parse(repaired ?? '')).toEqual({
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          results: [{ ruleId: 'EmptyCatchBlock' }],
          invocations: [
            {
              executionSuccessful: false,
              toolExecutionNotifications: [
                {
                  locations: [
                    { physicalLocation: { artifactLocation: { uri: 'file:///p/A.java' } } },
                  ],
                  message: { text: 'StringIndexOutOfBoundsException' },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('stops the error at its first line, also when an older and longer report follows the cut', () => {
    const stale = 't": "An older result."\n          }\n        }\n      ],\n';
    const overwritten = cutOffSarifReport(`${HEAD}${LOCATION}${CUT_MESSAGE}${stale}${CUT_MESSAGE}`);
    const split = cutOffSarifReport(`${HEAD}${LOCATION}${CUT_MESSAGE.slice(0, 80)}\\`);
    const early = cutOffSarifReport(HEAD);

    expect([messageTextOf(overwritten), messageTextOf(split), JSON.parse(early ?? '')]).toEqual([
      'StringIndexOutOfBoundsException',
      'StringIndexOutOfBoundsExcept',
      {
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        version: '2.1.0',
        runs: [
          {
            results: [{ ruleId: 'EmptyCatchBlock' }],
            invocations: [{ executionSuccessful: false, toolExecutionNotifications: [] }],
          },
        ],
      },
    ]);
  });

  it('is not a repair for text that is not a cut-off report', () => {
    expect([
      cutOffSarifReport('{"version":'),
      cutOffSarifReport('not json'),
      cutOffSarifReport(`${HEAD}]}]}]}`),
      cutOffSarifReport(`${HEAD}{ "message": { "text": "one" }, "level": tru ]}]}]}`),
    ]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('keeps a whole report as it is when only an older report follows it', () => {
    const whole = `${HEAD}{ "message": { "text": "one\\ntwo" }, "level": "error" }]}]}]}`;

    expect(JSON.parse(cutOffSarifReport(`${whole}\n  "stale": [1] }`) ?? '')).toEqual(
      JSON.parse(whole),
    );
  });
});
