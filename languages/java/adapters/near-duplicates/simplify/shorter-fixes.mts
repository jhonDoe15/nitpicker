import type { Node, Parser } from 'web-tree-sitter';
import { shorterConditions as untypedShorterConditions } from '../../../../../shared/rules/shorter/condition-sites.mjs';
import { depthFirst } from '../jvm-views.mts';
import type { Unit } from '../jvm-types.mts';

type Site = {
  readonly node: { readonly start: number };
  readonly condition: string;
  readonly form: string;
};
type Options = {
  readonly isPython: boolean;
  readonly kotlin: boolean;
  readonly references: boolean;
};
type Source = { readonly file: string; readonly text: string };
type UnitsOf = (program: Node, file: string) => Unit[];
type ReplaceEdit = {
  readonly type: 'replace';
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
};
export type ShorterFix = {
  readonly finding: {
    readonly tool: string;
    readonly rule: string;
    readonly path: string;
    readonly line: number;
  };
  readonly edits: readonly ReplaceEdit[];
};
export type Grammar = { readonly parser: Parser; readonly unitsOf: UnitsOf };

const shorterConditions: (tree: unknown, options: Options) => readonly Site[] =
  untypedShorterConditions;
const COMMENT = /\/[/*]/u;
const SPACE = /\s+/gu;
const OPERATOR_PARENTS = new Set([
  'binary_expression',
  'unary_expression',
  'instanceof_expression',
  'cast_expression',
  'field_access',
  'method_invocation',
  'array_access',
  'equality_expression',
  'comparison_expression',
  'conjunction_expression',
  'disjunction_expression',
  'prefix_expression',
  'additive_expression',
  'multiplicative_expression',
  'infix_expression',
  'elvis_expression',
  'as_expression',
  'check_expression',
  'navigation_expression',
  'call_expression',
  'range_expression',
]);

function compact(text: string): string {
  return text.replaceAll(SPACE, '');
}

function sitesOf(units: readonly Unit[], kotlin: boolean): Site[] {
  return units
    .filter((unit) => unit.tree.kind === 'function')
    .flatMap((unit) => shorterConditions(unit.tree, { isPython: false, kotlin, references: true }));
}

function nodeFor(root: Node, site: Site): Node | undefined {
  const wanted = compact(site.condition);
  const found = [...depthFirst(root, (node: Node) => node.namedChildren)].filter(
    (node) => node.startPosition.row + 1 === site.node.start && compact(node.text) === wanted,
  );
  const ids = new Set(found.map(({ id }) => id));
  const outermost = found.filter((node) => !ids.has(node.parent?.id ?? -1));
  return outermost.length === 1 ? outermost[0] : undefined;
}

function replacement(node: Node, form: string): string {
  return OPERATOR_PARENTS.has(node.parent?.type ?? '') ? `(${form})` : form;
}

function fixOf(root: Node, site: Site, file: string): ShorterFix[] {
  const node = nodeFor(root, site);
  if (node === undefined || COMMENT.test(node.text) || compact(site.form) === compact(node.text)) {
    return [];
  }
  return [
    {
      finding: { tool: 'structure', rule: 'shorter-condition', path: file, line: site.node.start },
      edits: [
        {
          type: 'replace',
          path: file,
          start: node.startIndex,
          end: node.endIndex,
          text: replacement(node, site.form),
        },
      ],
    },
  ];
}

export function shorterFixes(grammar: Grammar, { file, text }: Source): ShorterFix[] {
  const tree = grammar.parser.parse(text);
  if (tree === null) {
    return [];
  }
  try {
    const sites = sitesOf(grammar.unitsOf(tree.rootNode, file), file.endsWith('.kt'));
    return sites.flatMap((site) => fixOf(tree.rootNode, site, file));
  } finally {
    tree.delete();
  }
}
