import { summaryOf } from './summary-view.mts';
import type { JunitProfile, RunSummary, SarifProfile } from './summary-view.mts';

function profileProperties(summary: RunSummary): [string, string][] {
  return [
    ...(summary.quick === undefined ? [] : [['quick', 'true'] satisfies [string, string]]),
    ...(summary.staged === true ? [['staged', 'true'] satisfies [string, string]] : []),
  ];
}

export function junitRunProfile(
  input: unknown,
  classname: string,
  escape: (value: unknown) => string,
): JunitProfile {
  const summary = summaryOf(input);
  const properties = profileProperties(summary);
  const skipped = summary.quick?.skipped ?? [];
  return {
    propertyLines:
      properties.length === 0
        ? []
        : [
            '  <properties>',
            ...properties.map(([name, value]) => `    <property name="${name}" value="${value}"/>`),
            '  </properties>',
          ],
    skippedCases: skipped.map((check) =>
      [
        `  <testcase classname="${classname}.skipped" name="${escape(check)}" time="0">`,
        `<skipped message="${escape(summary.quick?.message)}"/></testcase>`,
      ].join(''),
    ),
    skippedAttribute: summary.quick === undefined ? '' : ` skipped="${String(skipped.length)}"`,
  };
}

export function sarifRunProfile(input: unknown): SarifProfile {
  const summary = summaryOf(input);
  return {
    notifications:
      summary.quick === undefined
        ? []
        : [{ level: 'warning', message: { text: summary.quick.message } }],
    properties: {
      ...(summary.quick === undefined ? {} : { quick: true, skipped: summary.quick.skipped }),
      ...(summary.staged === true ? { staged: true } : {}),
    },
  };
}
