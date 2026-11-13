import type { Callee, Expr } from '../model/syntax-types.mts';

const SIMPLE = new Set([
  'lit',
  'undefined',
  'param',
  'local',
  'global',
  'import',
  'helper',
  'get',
  'call',
  'object',
]);

function literalText(expr: Extract<Expr, { kind: 'lit' }>): string {
  return expr.via === undefined
    ? JSON.stringify(expr.value)
    : `${expr.via} (${JSON.stringify(expr.value)})`;
}

export function render(expr: Expr): string {
  switch (expr.kind) {
    case 'lit':
      return literalText(expr);
    case 'undefined':
      return 'undefined';
    case 'param':
    case 'local':
    case 'global':
    case 'import':
    case 'helper':
    case 'module':
      return expr.name;
    case 'get':
      return `${render(expr.object)}.${String(expr.field)}`;
    case 'call':
      return `${calleeText(expr.callee)}(${renderList(expr.args)})`;
    case 'new':
      return `new ${expr.name}(${renderList(expr.args)})`;
    case 'cmp':
      return `${render(expr.left)} ${expr.op} ${render(expr.right)}`;
    case 'not':
      return `!${grouped(expr.operand)}`;
    case 'and':
      return `${grouped(expr.left)} && ${grouped(expr.right)}`;
    case 'or':
      return `${grouped(expr.left)} || ${grouped(expr.right)}`;
    case 'cond':
      return `${grouped(expr.test)} ? ${grouped(expr.then)} : ${grouped(expr.else)}`;
    case 'object':
      return `{ ${expr.fields.map(([key, value]) => `${key}: ${render(value)}`).join(', ')} }`;
    case 'template':
      return `\`${expr.parts.map(templatePart).join('')}\``;
    case 'unsupported':
      return `<${expr.syntax}>`;
  }
}

export function calleeText(callee: Callee): string {
  if (callee.kind === 'member') {
    return `${render(callee.receiver)}.${callee.method}`;
  }
  return callee.kind === 'dynamic' ? `<dynamic ${callee.syntax}>` : callee.name;
}

function renderList(exprs: readonly Expr[]): string {
  return exprs.map(render).join(', ');
}

function grouped(expr: Expr): string {
  return SIMPLE.has(expr.kind) ? render(expr) : `(${render(expr)})`;
}

function templatePart(part: string | Expr): string {
  return typeof part === 'string' ? part : `\${${render(part)}}`;
}
