type Suggestion = 'awaitTwin' | 'awaitAccess';

export function fixes(code: string, output: string, messageId: Suggestion = 'awaitTwin') {
  return {
    code,
    errors: [{ messageId: 'blocking' as const, suggestions: [{ messageId, output }] }],
  };
}

export function declines(code: string, count = 1) {
  return {
    code,
    errors: Array.from({ length: count }, () => ({ messageId: 'blocking' as const })),
  };
}

export const FS = 'import fs from "node:fs";\n';
