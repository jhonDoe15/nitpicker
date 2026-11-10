function profileProperties(summary) {
  return [
    ...(summary.quick === undefined ? [] : [['quick', 'true']]),
    ...(summary.staged === true ? [['staged', 'true']] : []),
  ];
}

export function junitRunProfile(summary, classname, escape) {
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
        `<skipped message="${escape(summary.quick.message)}"/></testcase>`,
      ].join(''),
    ),
    skippedAttribute: summary.quick === undefined ? '' : ` skipped="${String(skipped.length)}"`,
  };
}

export function sarifRunProfile(summary) {
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
