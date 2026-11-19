const UNUSED_DISABLE_DIRECTIVE = 'eslint/unused-disable-directive';
const UNUSED_ENABLE_DIRECTIVE = 'eslint/unused-enable-directive';
export const INLINE_CONFIG_DISABLED = 'eslint/inline-config-disabled';
const UNATTRIBUTED_MESSAGE = 'eslint/unattributed-message';

export const UNUSED_DIRECTIVE_RULES: ReadonlySet<string> = new Set([
  UNUSED_DISABLE_DIRECTIVE,
  UNUSED_ENABLE_DIRECTIVE,
]);

export function nonRuleDiagnosticId(message: string): string {
  if (message.startsWith('Unused eslint-disable directive')) {
    return UNUSED_DISABLE_DIRECTIVE;
  }
  if (message.startsWith('Unused eslint-enable directive')) {
    return UNUSED_ENABLE_DIRECTIVE;
  }
  if (message.includes("has no effect because you have 'noInlineConfig' setting")) {
    return INLINE_CONFIG_DISABLED;
  }
  return UNATTRIBUTED_MESSAGE;
}
