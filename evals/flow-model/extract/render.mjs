const RENDERERS = {
  lit: (expr) => (expr.via === undefined ? JSON.stringify(expr.value) : expr.via),
  undefined: () => 'undefined',
  param: (expr) => expr.name,
  local: (expr) => expr.name,
  global: (expr) => expr.name,
  import: (expr) => expr.name,
  helper: (expr) => expr.name,
  module: (expr) => expr.name,
  get: (expr) => `${render(expr.object)}.${expr.field}`,
  call: (expr) => `${calleeText(expr.callee)}(${renderList(expr.args)})`,
  new: (expr) => `new ${expr.name}(${renderList(expr.args)})`,
  cmp: (expr) => `${render(expr.left)} ${expr.op} ${render(expr.right)}`,
  not: (expr) => `!${grouped(expr.operand)}`,
  and: (expr) => `${grouped(expr.left)} && ${grouped(expr.right)}`,
  or: (expr) => `${grouped(expr.left)} || ${grouped(expr.right)}`,
  cond: (expr) => `${grouped(expr.test)} ? ${grouped(expr.then)} : ${grouped(expr.else)}`,
  object: (expr) =>
    `{ ${expr.fields.map(([key, value]) => `${key}: ${render(value)}`).join(', ')} }`,
  template: (expr) => `\`${expr.parts.map(templatePart).join('')}\``,
  unsupported: (expr) => `<${expr.syntax}>`,
};

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

export function render(expr) {
  return RENDERERS[expr.kind](expr);
}

export function calleeText(callee) {
  if (callee.kind === 'member') {
    return `${render(callee.receiver)}.${callee.method}`;
  }
  return callee.kind === 'dynamic' ? `<dynamic ${callee.syntax}>` : callee.name;
}

function renderList(exprs) {
  return exprs.map(render).join(', ');
}

function grouped(expr) {
  return SIMPLE.has(expr.kind) ? render(expr) : `(${render(expr)})`;
}

function templatePart(part) {
  return typeof part === 'string' ? part : `\${${render(part)}}`;
}
