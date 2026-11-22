import ts from 'typescript';
import { fieldOf, fieldsOf } from '../../../../../shared/values/readers.mts';

type PolicyEntry = Readonly<Record<string, unknown>>;

type ReleaseTracker = {
  release(): void;
  track(sourceFile: object): void;
};

function isSourceFileObject(value: unknown): value is object {
  return (
    typeof value === 'object' &&
    value !== null &&
    fieldOf(value, 'kind') === ts.SyntaxKind.SourceFile
  );
}

export function typedSourceFileOf(result: unknown): object | undefined {
  const services = fieldOf(result, 'services');
  if (fieldOf(services, 'program') == null) {
    return undefined;
  }
  const ast = fieldOf(result, 'ast');
  const map = fieldOf(services, 'esTreeNodeToTSNodeMap');
  if (!(map instanceof WeakMap) || typeof ast !== 'object' || ast === null) {
    return undefined;
  }
  const node: unknown = map.get(ast);
  return isSourceFileObject(node) ? node : undefined;
}

export function releaseSourceFileChildren(sourceFile: object): void {
  const transfer = fieldOf(ts, 'transferSourceFileChildren');
  if (typeof transfer === 'function') {
    Reflect.apply(transfer, ts, [sourceFile, {}]);
  }
}

function createReleaseTracker(): ReleaseTracker {
  let previousSourceFile: object | undefined;
  return {
    release() {
      if (previousSourceFile !== undefined) {
        releaseSourceFileChildren(previousSourceFile);
        previousSourceFile = undefined;
      }
    },
    track(sourceFile: object) {
      previousSourceFile = sourceFile;
    },
  };
}

export function wrapTokenReleasingParser<Parser extends object>(
  parser: Parser,
  tracker: ReleaseTracker = createReleaseTracker(),
): Parser {
  const parse = fieldOf(parser, 'parseForESLint');
  if (typeof parse !== 'function') {
    return parser;
  }
  const parseForESLint = (code: string, options?: Readonly<Record<string, unknown>>): unknown => {
    tracker.release();
    const result: unknown = Reflect.apply(parse, parser, [code, options]);
    const sourceFile = typedSourceFileOf(result);
    if (sourceFile !== undefined) {
      tracker.track(sourceFile);
    }
    return result;
  };
  return { ...parser, parseForESLint };
}

function wrapEntryParser<Entry extends PolicyEntry>(
  entry: Entry,
  wrapped: WeakMap<object, object>,
  tracker: ReleaseTracker,
): Entry {
  const languageOptions = fieldOf(entry, 'languageOptions');
  const parser = fieldOf(languageOptions, 'parser');
  if (
    typeof parser !== 'object' ||
    parser === null ||
    typeof fieldOf(parser, 'parseForESLint') !== 'function'
  ) {
    return entry;
  }
  const existing = wrapped.get(parser) ?? wrapTokenReleasingParser(parser, tracker);
  wrapped.set(parser, existing);
  return {
    ...entry,
    languageOptions: { ...fieldsOf(languageOptions), parser: existing },
  };
}

export function withTokenReleasingParsers<Entry extends PolicyEntry>(
  entries: readonly Entry[],
): Entry[] {
  const wrapped = new WeakMap<object, object>();
  const tracker = createReleaseTracker();
  return entries.map((entry) => wrapEntryParser(entry, wrapped, tracker));
}
