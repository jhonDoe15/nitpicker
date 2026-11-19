import { createRequire } from 'node:module';
import tseslint from 'typescript-eslint';
import { isScriptSource, isSloppyModeMessage } from './legacy-scripts.mts';

type ParseOptions = Readonly<Record<string, unknown>>;
type ParseResult = { readonly ast: unknown; readonly scopeManager?: unknown };
type Espree = { parse(code: string, options: ParseOptions): unknown };

const fromEslint = createRequire(import.meta.resolve('eslint'));
const parseTypeScript: (code: string, options: ParseOptions) => ParseResult =
  tseslint.parser.parseForESLint.bind(tseslint.parser);

function isEspree(value: unknown): value is Espree {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'parse') === 'function'
  );
}

function espree(): Espree {
  const loaded: unknown = fromEslint('espree');
  if (!isEspree(loaded)) {
    throw new TypeError('espree, the parser ESLint ships, has no parse function');
  }
  return loaded;
}

function scriptAst(code: string, filePath: string): unknown {
  return espree().parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    range: true,
    loc: true,
    tokens: true,
    comment: true,
    ecmaFeatures: { jsx: filePath.toLowerCase().endsWith('.jsx'), globalReturn: true },
  });
}

function parseForESLint(code: string, options: ParseOptions = {}): ParseResult {
  try {
    return parseTypeScript(code, options);
  } catch (error) {
    const filePath = typeof options['filePath'] === 'string' ? options['filePath'] : '';
    if (error instanceof Error && isScriptSource(filePath) && isSloppyModeMessage(error.message)) {
      return { ast: scriptAst(code, filePath) };
    }
    throw error;
  }
}

export const scriptTolerantParser = {
  meta: { name: 'nitpicker-script-tolerant-parser' },
  parseForESLint,
};
