import { ts } from '../../../typescript-api/typescript-api.mjs';

const UNUSED_VARIABLE_RULES = new Set(['@typescript-eslint/no-unused-vars', 'no-unused-vars']);

function isCatchParameter(node) {
  return (
    node !== undefined &&
    ts.isIdentifier(node) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isCatchClause(node.parent.parent)
  );
}

export function withCatchParameterWording(fields, { ruleId, comment, locatedNode }) {
  return UNUSED_VARIABLE_RULES.has(ruleId) && comment === undefined && isCatchParameter(locatedNode)
    ? { ...fields, message: `Catch parameter ${fields.message}` }
    : fields;
}
