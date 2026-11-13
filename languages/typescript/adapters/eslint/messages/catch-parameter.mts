import type TypeScript from 'typescript';
import { typescriptApi } from '../../typed/typescript-program.mts';

type MessageFields = { readonly message: string; readonly allowedForm?: string };

const ts = typescriptApi();

const UNUSED_VARIABLE_RULES = new Set(['@typescript-eslint/no-unused-vars', 'no-unused-vars']);

function isCatchParameter(node: TypeScript.Node | undefined): boolean {
  return (
    node !== undefined &&
    ts.isIdentifier(node) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isCatchClause(node.parent.parent)
  );
}

export function withCatchParameterWording<Fields extends MessageFields>(
  fields: Fields,
  {
    ruleId,
    comment,
    locatedNode,
  }: {
    readonly ruleId: string;
    readonly comment: string | undefined;
    readonly locatedNode: TypeScript.Node;
  },
): Fields {
  return UNUSED_VARIABLE_RULES.has(ruleId) && comment === undefined && isCatchParameter(locatedNode)
    ? { ...fields, message: `Catch parameter ${fields.message}` }
    : fields;
}
