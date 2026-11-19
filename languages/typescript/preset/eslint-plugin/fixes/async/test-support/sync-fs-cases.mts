type Suggestion = 'awaitTwin' | 'awaitAccess';
type BlockingError = {
  messageId: 'blocking';
  suggestions?: { messageId: Suggestion; output: string }[];
};
type BlockingCase = { code: string; errors: BlockingError[] };

export function fixes(
  code: string,
  output: string,
  messageId: Suggestion = 'awaitTwin',
): BlockingCase {
  return {
    code,
    errors: [{ messageId: 'blocking' as const, suggestions: [{ messageId, output }] }],
  };
}

export function declines(code: string, count = 1): BlockingCase {
  return {
    code,
    errors: Array.from({ length: count }, () => ({ messageId: 'blocking' as const })),
  };
}

export const FS = 'import fs from "node:fs";\n';
