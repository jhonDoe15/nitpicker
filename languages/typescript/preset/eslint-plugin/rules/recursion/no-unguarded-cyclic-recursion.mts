import type { TSESLint } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices } from '../security/security-values.mts';
import { ts } from '../typed/typescript-views.mts';
import { stepOf, unwrap } from './cyclic-steps.mts';

type Checker = TypeScript.TypeChecker;
type Finding = {
  readonly call: TypeScript.CallExpression;
  readonly name: string;
  readonly via: string;
};

const GUARD_NAME = new RegExp(
  'depth|level|seen|visited|visiting|stack|memo|cache|limit|remaining|budget|ttl',
  'iu',
);
const GUARD_TYPES = new Set(['Set', 'WeakSet', 'Map', 'WeakMap', 'ReadonlySet', 'ReadonlyMap']);
const SYNTAX_PACKAGES = new RegExp(
  'node_modules/(?:typescript/lib/typescript\\.d\\.ts|@typescript-eslint/|@types/estree/|' +
    'estree/|eslint/|@babel/|acorn/)',
  'u',
);

type Named = {
  readonly fn: TypeScript.FunctionLikeDeclaration;
  readonly name: string;
  readonly nameNode: TypeScript.Node;
};

function functionOf(node: TypeScript.Node): Named | undefined {
  const declared =
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
    node.body !== undefined &&
    node.name !== undefined &&
    ts.isIdentifier(node.name);
  if (declared && node.name !== undefined && ts.isIdentifier(node.name)) {
    return { fn: node, name: node.name.text, nameNode: node.name };
  }
  const init = ts.isVariableDeclaration(node) ? node.initializer : undefined;
  const callable =
    init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
  return callable && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
    ? { fn: init, name: node.name.text, nameNode: node.name }
    : undefined;
}

function isGuarded(fn: TypeScript.Node, checker: Checker): boolean {
  let guarded = false;
  const visit = (node: TypeScript.Node) => {
    if (ts.isIdentifier(node)) {
      const type = checker.getTypeAtLocation(node);
      guarded ||= GUARD_NAME.test(node.text) || GUARD_TYPES.has(type.getSymbol()?.getName() ?? '');
    }
    node.forEachChild(visit);
  };
  visit(fn);
  return guarded;
}

function isSyntaxType(type: TypeScript.Type): boolean {
  const symbol = type.getSymbol() ?? type.aliasSymbol;
  const files = (symbol?.declarations ?? []).map((declaration) =>
    declaration.getSourceFile().fileName.replaceAll('\\', '/'),
  );
  const name = symbol?.getName() ?? '';
  return files.some((file) => SYNTAX_PACKAGES.test(file)) && name !== 'Type';
}

function isTypeApi(type: TypeScript.Type): boolean {
  const symbol = type.getSymbol();
  const declared = symbol?.declarations?.[0]?.getSourceFile().fileName.replaceAll('\\', '/') ?? '';
  return (
    /node_modules\/typescript\/lib\/typescript\.d\.ts$/u.test(declared) &&
    symbol?.getName() === 'Type'
  );
}

type Walk = {
  readonly fn: TypeScript.FunctionLikeDeclaration;
  readonly name: string;
  readonly symbol: TypeScript.Symbol;
};

function recursiveTarget(node: TypeScript.CallExpression): TypeScript.MemberName | undefined {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) {
    return callee;
  }
  const onThis =
    ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword;
  return onThis ? callee.name : undefined;
}

function recursiveCalls({ fn, name, symbol }: Walk, checker: Checker): TypeScript.CallExpression[] {
  const calls: TypeScript.CallExpression[] = [];
  const visit = (node: TypeScript.Node) => {
    const target = ts.isCallExpression(node) ? recursiveTarget(node) : undefined;
    const recursive = target?.text === name && checker.getSymbolAtLocation(target) === symbol;
    if (ts.isCallExpression(node) && recursive) {
      calls.push(node);
    }
    node.forEachChild(visit);
  };
  fn.body?.forEachChild(visit);
  return calls;
}

function findingOfWalk(walk: Walk, checker: Checker): Finding | undefined {
  for (const call of recursiveCalls(walk, checker)) {
    const via = findingOf(call, walk.fn, checker);
    if (via !== undefined) {
      return { call, name: walk.name, via };
    }
  }
  return undefined;
}

function walkOf(node: TypeScript.Node, checker: Checker): Walk | undefined {
  const found = functionOf(node);
  const symbol = found === undefined ? undefined : checker.getSymbolAtLocation(found.nameNode);
  return found !== undefined && symbol !== undefined
    ? { fn: found.fn, name: found.name, symbol }
    : undefined;
}

export function findingsIn(sourceFile: TypeScript.SourceFile, checker: Checker): Finding[] {
  const findings: Finding[] = [];
  const visit = (node: TypeScript.Node) => {
    const walk = walkOf(node, checker);
    const finding = walk === undefined ? undefined : findingOfWalk(walk, checker);
    if (walk !== undefined && finding !== undefined && !isGuarded(walk.fn, checker)) {
      findings.push(finding);
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return findings;
}

function findingOf(
  call: TypeScript.CallExpression,
  fn: TypeScript.FunctionLikeDeclaration,
  checker: Checker,
): string | undefined {
  for (const [index, argument] of call.arguments.entries()) {
    const parameter = fn.parameters[index];
    const paramSymbol =
      parameter !== undefined && ts.isIdentifier(parameter.name)
        ? checker.getSymbolAtLocation(parameter.name)
        : undefined;
    if (parameter === undefined || paramSymbol === undefined) {
      continue;
    }
    const paramType = checker.getTypeAtLocation(parameter.name);
    const argType = checker.getNonNullableType(checker.getTypeAtLocation(unwrap(argument)));
    const typed =
      (paramType.flags & ts.TypeFlags.Any) === 0 && (argType.flags & ts.TypeFlags.Any) === 0;
    const isType = isTypeApi(checker.getNonNullableType(paramType));
    const step =
      typed && !isSyntaxType(paramType)
        ? stepOf(argument, { checker, param: paramSymbol, isType })
        : undefined;
    if (step !== undefined && checker.isTypeAssignableTo(argType, paramType)) {
      return step.via;
    }
  }
  return undefined;
}

export const rule: TSESLint.RuleModule<'cyclic', [], { readonly requiresTypeChecking: boolean }> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report a recursive walk over a graph that can contain cycles, with no visited set or depth limit',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      cyclic:
        '`{{name}}` recurses into `{{via}}` with no visited set or depth limit, so a cycle (a recursive type, a dependency graph, an error cause chain) overflows the stack. Pass a `Set` of visited values and return when the value is in it, or stop at a depth limit.',
    },
  },
  create(context) {
    const services = typeServices(context);
    if (services === undefined) {
      return {};
    }
    return {
      Program(program) {
        const { program: tsProgram, esTreeNodeToTSNodeMap } = services;
        const sourceFile = esTreeNodeToTSNodeMap.get(program);
        for (const { call, name, via } of findingsIn(sourceFile, tsProgram.getTypeChecker())) {
          const start = sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile));
          const end = sourceFile.getLineAndCharacterOfPosition(call.getEnd());
          context.report({
            loc: {
              start: { line: start.line + 1, column: start.character },
              end: { line: end.line + 1, column: end.character },
            },
            messageId: 'cyclic',
            data: { name, via },
          });
        }
      },
    };
  },
};
