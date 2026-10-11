export function withHint(rule, hint) {
  return {
    ...rule,
    meta: { ...rule.meta, messages: hintedMessages(rule.meta.messages ?? {}, hint) },
    create: (context) => rule.create(hintedContext(context, hint)),
  };
}

function hintedMessages(messages, hint) {
  return Object.fromEntries(Object.entries(messages).map(([id, text]) => [id, `${text}${hint}`]));
}

function hintedContext(context, hint) {
  return Object.create(context, {
    report: { value: (descriptor) => context.report(hintedDescriptor(descriptor, hint)) },
  });
}

function hintedDescriptor(descriptor, hint) {
  return descriptor.message === undefined
    ? descriptor
    : { ...descriptor, message: `${descriptor.message}${hint}` };
}
