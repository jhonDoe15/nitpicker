import type TypeScript from 'typescript';
import { formatDiagnostic, withoutProjectRoot } from './typescript-program.mts';

const INDEX_SIGNATURE_ACCESS = 4111;

const INDEX_SIGNATURE_HINT =
  " Read a key of an index signature with brackets: `import.meta.env['VITE_API_URL']`, `styles['card']`, `process.env['PORT']`.";
const EXACT_OPTIONAL_HINT =
  ' Declare the optional field `title?: string | undefined` when a caller passes `undefined` through (as when forwarding a prop), or leave the key out when the value is missing.';

function hintFor(code: number, message: string): string {
  if (code === INDEX_SIGNATURE_ACCESS) {
    return INDEX_SIGNATURE_HINT;
  }
  return message.includes("'exactOptionalPropertyTypes: true'") ? EXACT_OPTIONAL_HINT : '';
}

export function diagnosticMessages(
  ts: typeof TypeScript,
  diagnostic: TypeScript.Diagnostic,
  projectRoot: string,
): { message: string; display: string } {
  const message = withoutProjectRoot(formatDiagnostic(ts, diagnostic), projectRoot);
  return { message, display: `${message}${hintFor(diagnostic.code, message)}` };
}
