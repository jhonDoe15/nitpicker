import { createRequire } from 'node:module';
import { fieldOf } from '../../../../../shared/values/readers.mts';

type Parse = (code: string, options?: unknown) => unknown;
type Parser = Readonly<Record<string, unknown>> & { readonly parseForESLint: Parse };
type Release = (sourceFile: object, target: object) => void;

function releaseOfCompiler(): unknown {
  const compiler: unknown = createRequire(import.meta.resolve('typescript-eslint'))('typescript');
  return fieldOf(compiler, 'transferSourceFileChildren');
}

function sourceFileOf(parsed: unknown): object | undefined {
  const map = fieldOf(fieldOf(parsed, 'services'), 'esTreeNodeToTSNodeMap');
  const ast = fieldOf(parsed, 'ast');
  const found: unknown =
    map instanceof WeakMap && typeof ast === 'object' && ast !== null ? map.get(ast) : undefined;
  return typeof found === 'object' && found !== null ? found : undefined;
}

function isRelease(value: unknown): value is Release {
  return typeof value === 'function';
}

export function isParser(value: unknown): value is Parser {
  return typeof fieldOf(value, 'parseForESLint') === 'function';
}

export function releasingChildren(parser: Parser): Parser {
  const release = releaseOfCompiler();
  if (!isRelease(release)) {
    return parser;
  }
  const state: { previous: object | undefined } = { previous: undefined };
  return {
    ...parser,
    parseForESLint(code, options) {
      if (state.previous !== undefined) {
        release(state.previous, {});
      }
      const parsed = parser.parseForESLint(code, options);
      state.previous = sourceFileOf(parsed);
      return parsed;
    },
  };
}
