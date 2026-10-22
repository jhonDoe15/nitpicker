export function withReportFilter(baseRule, keepsReport, messages = {}) {
  return {
    ...baseRule,
    meta: { ...baseRule.meta, messages: { ...baseRule.meta.messages, ...messages } },
    create(context) {
      return baseRule.create(
        Object.create(context, {
          report: {
            value(descriptor) {
              if (keepsReport(descriptor, context)) {
                context.report(descriptor);
              }
            },
          },
        }),
      );
    },
  };
}
