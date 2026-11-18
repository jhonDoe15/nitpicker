import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import ts from 'typescript';
import { nameOf, type SourceCode } from '../../typed/node-views.mts';
import { isCloseName } from '../scope/close-scopes.mts';
import { calleeProperty } from '../shared/scopes.mts';

const SUBSCRIBING =
  /^(on[A-Z_]|subscribe|listen|watch|observe|autorun|addListener|addEventListener|register[A-Z])/u;
const ONE_SHOT = /^once/iu;
const BOUNDED_RECEIVER =
  /\b(take|takeUntil|takeUntilDestroyed|takeWhile|first|last|toPromise)\(|[hH]ttp|\.pipe\(\s*(take|first)/u;
const RELEASERS = ['dispose', 'unsubscribe'];

export function subscribingName(call: TSESTree.CallExpression): string | undefined {
  const name = calleeProperty(call);
  const own =
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    call.callee.object.type === AST_NODE_TYPES.ThisExpression;
  return name !== undefined &&
    SUBSCRIBING.test(name) &&
    !ONE_SHOT.test(name) &&
    !(own && name.startsWith('register'))
    ? name
    : undefined;
}

function returnsVoidWithoutArguments(checker: ts.TypeChecker, type: ts.Type): boolean {
  const signatures = type.getCallSignatures();
  return (
    signatures.length > 0 &&
    signatures.every(
      (signature) =>
        signature
          .getParameters()
          .every(
            (parameter) =>
              parameter.valueDeclaration !== undefined &&
              ts.isParameter(parameter.valueDeclaration) &&
              (parameter.valueDeclaration.questionToken !== undefined ||
                parameter.valueDeclaration.initializer !== undefined),
          ) &&
        (checker.getReturnTypeOfSignature(signature).flags &
          (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) !==
          0,
    )
  );
}

function hasReleaser(checker: ts.TypeChecker, type: ts.Type, node: ts.Node): boolean {
  return RELEASERS.some((name) => {
    const property = type.getProperty(name);
    return (
      property !== undefined &&
      returnsVoidWithoutArguments(checker, checker.getTypeOfSymbolAtLocation(property, node))
    );
  });
}

export function isReleaseHandle(checker: ts.TypeChecker, type: ts.Type, node: ts.Node): boolean {
  const plain = checker.getNonNullableType(type);
  if ((plain.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) !== 0) {
    return false;
  }
  const parts = plain.isUnion() ? plain.types : [plain];
  return parts.every(
    (part) => hasReleaser(checker, part, node) || returnsVoidWithoutArguments(checker, part),
  );
}

export function boundedReceiver(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    BOUNDED_RECEIVER.test(sourceCode.getText(callee.object))
  );
}

export function ownedEmitter(
  classBody: TSESTree.ClassBody,
  call: TSESTree.CallExpression,
): boolean {
  const { callee } = call;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.object.type !== AST_NODE_TYPES.MemberExpression ||
    callee.object.object.type !== AST_NODE_TYPES.ThisExpression
  ) {
    return false;
  }
  const field = nameOf(callee.object.property);
  return classBody.body.some(
    (member) =>
      member.type === AST_NODE_TYPES.PropertyDefinition &&
      nameOf(member.key) === field &&
      member.value?.type === AST_NODE_TYPES.NewExpression,
  );
}

export function releasingClass(classBody: TSESTree.ClassBody): boolean {
  return classBody.body.some((member) => {
    const name = member.type === AST_NODE_TYPES.MethodDefinition ? nameOf(member.key) : undefined;
    return name !== undefined && (isCloseName(name) || name === 'ngOnDestroy');
  });
}
