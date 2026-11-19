import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import type {
  Converted,
  Converter,
  Shape,
  TextContext,
  TreeContext,
  TreeNode,
} from './typed/tree-types.mts';

const ts = typescriptApi();

export const NONE: TreeNode = Object.freeze({ kind: 'none', children: Object.freeze([]) });

export function on<Source extends TypeScript.Node>(
  guard: (node: TypeScript.Node) => node is Source,
  convert: (source: Source, context: TreeContext) => Converted,
): Converter {
  return (source, context) => (guard(source) ? convert(source, context) : NONE);
}

function lineOf(sourceFile: TypeScript.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

export function at(
  shape: string | Shape,
  source: TypeScript.Node,
  children: readonly Converted[] = [],
): TreeNode {
  const fields = typeof shape === 'string' ? { kind: shape } : shape;
  const sourceFile = source.getSourceFile();
  return {
    ...fields,
    children,
    start: lineOf(sourceFile, source.getStart(sourceFile)),
    end: lineOf(sourceFile, source.getEnd()),
  };
}

export function textOf(source: TypeScript.Node, context: TextContext): string {
  return source.getText(context.sourceFile).replaceAll(/\s+/gu, ' ');
}

export function opaque(kind: string, source: TypeScript.Node, context: TextContext): TreeNode {
  return at({ kind, value: `${ts.SyntaxKind[source.kind]}:${textOf(source, context)}` }, source);
}

export function optional(source: TypeScript.Node | undefined, context: TreeContext): Converted {
  return source === undefined ? NONE : context.get(source);
}

const STATEMENT_DECLARATIONS = [
  ts.isTypeAliasDeclaration,
  ts.isInterfaceDeclaration,
  ts.isEnumDeclaration,
  ts.isModuleDeclaration,
  ts.isImportDeclaration,
  ts.isImportEqualsDeclaration,
];

export function isStatementNode(source: TypeScript.Node): boolean {
  return (
    (source.kind >= ts.SyntaxKind.FirstStatement && source.kind <= ts.SyntaxKind.LastStatement) ||
    STATEMENT_DECLARATIONS.some((matches) => matches(source))
  );
}
