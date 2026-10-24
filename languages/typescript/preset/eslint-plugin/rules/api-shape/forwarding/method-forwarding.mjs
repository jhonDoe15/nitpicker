import { depthFirst, objectChildren } from '../../../../../../../shared/traversal.mjs';
import {
  forwardedCall,
  forwardsOwnParameters,
  hasSameSignature,
  isPlainFunction,
} from './call-contract.mjs';

const COMPATIBILITY_NAMES = new Set(['of', 'from', 'valueOf', 'fromString']);

function namedMethod(node) {
  return (
    (node.type === 'MethodDefinition' || (node.type === 'Property' && node.method)) &&
    !node.computed &&
    (node.type === 'Property' ? node.kind === 'init' : node.kind === 'method') &&
    (node.key.type === 'Identifier' || node.key.type === 'PrivateIdentifier')
  );
}

function ownerOf(node) {
  const parent = node.parent;
  return parent.type === 'ClassBody' ? parent.parent : parent;
}

function methodsOf(owner) {
  return owner.type === 'ObjectExpression' ? owner.properties : owner.body.body;
}

function plainOwner(owner) {
  if (owner.type === 'ObjectExpression') {
    return owner.properties.every(
      (property) =>
        property.type !== 'SpreadElement' &&
        !property.computed &&
        property.key.name !== '__proto__' &&
        property.key.value !== '__proto__',
    );
  }
  return (
    (owner.type === 'ClassDeclaration' || owner.type === 'ClassExpression') &&
    owner.superClass === null &&
    owner.implements.length === 0 &&
    owner.decorators.length === 0 &&
    owner.body.body.every((member) => !member.computed && member.type !== 'StaticBlock')
  );
}

function plainMethod(sourceCode, method) {
  const documentation = sourceCode.getCommentsBefore(method);
  return (
    namedMethod(method) &&
    method.value.body !== null &&
    !method.override &&
    (method.decorators === undefined || method.decorators.length === 0) &&
    !COMPATIBILITY_NAMES.has(method.key.name) &&
    !documentation.some(({ value }) => /@(?:deprecated|override)\b/u.test(value)) &&
    isPlainFunction(method.value) &&
    method.value.params.every((parameter) => parameter.type === 'Identifier' && !parameter.optional)
  );
}

function ownTarget(owner, method, call) {
  const callee = call.callee;
  if (
    callee.type !== 'MemberExpression' ||
    callee.object.type !== 'ThisExpression' ||
    callee.computed ||
    callee.optional ||
    (callee.property.type !== 'Identifier' && callee.property.type !== 'PrivateIdentifier')
  ) {
    return undefined;
  }
  const targets = methodsOf(owner).filter(
    (candidate) => candidate.key?.name === callee.property.name,
  );
  const target = targets.length === 1 ? targets[0] : undefined;
  return target !== method &&
    target !== undefined &&
    namedMethod(target) &&
    target.static === method.static
    ? target
    : undefined;
}

function writtenTarget(node) {
  if (node.type === 'AssignmentExpression') {
    return node.left;
  }
  return node.type === 'UpdateExpression' ? node.argument : undefined;
}

function writtenOnThis(owner, name) {
  for (const node of depthFirst(owner, objectChildren)) {
    const left = writtenTarget(node);
    if (
      left?.type === 'MemberExpression' &&
      left.object.type === 'ThisExpression' &&
      (left.computed || left.property.name === name)
    ) {
      return true;
    }
  }
  return false;
}

function knownContract(services, fn) {
  const checker = services.program.getTypeChecker();
  const signatures = services.getTypeAtLocation(fn).getCallSignatures();
  return (
    signatures.length === 1 &&
    signatures.every(
      (signature) =>
        !['any', 'unknown'].includes(checker.typeToString(signature.getReturnType())) &&
        signature.parameters.every(
          (p) => !['any', 'unknown'].includes(checker.typeToString(checker.getTypeOfSymbol(p))),
        ),
    )
  );
}

function checkMethod(context, method) {
  const { sourceCode } = context;
  if (!plainMethod(sourceCode, method)) {
    return;
  }
  const owner = ownerOf(method);
  const call = forwardedCall(method.value);
  if (
    !plainOwner(owner) ||
    call?.type !== 'CallExpression' ||
    call.optional ||
    (call.typeArguments !== undefined && call.typeArguments !== null) ||
    !forwardsOwnParameters(method.value, call)
  ) {
    return;
  }
  const target = ownTarget(owner, method, call);
  if (
    target === undefined ||
    !plainMethod(sourceCode, target) ||
    writtenOnThis(owner, target.key.name) ||
    writtenOnThis(owner, method.key.name) ||
    !knownContract(sourceCode.parserServices, method.value) ||
    !hasSameSignature(sourceCode.parserServices, method.value, call.callee)
  ) {
    return;
  }
  context.report({
    node: method,
    messageId: 'forwardingMethod',
    data: { name: method.key.name, target: target.key.name },
  });
}

export function methodForwardingListeners(context) {
  return {
    MethodDefinition(node) {
      checkMethod(context, node);
    },
    Property(node) {
      if (node.method) {
        checkMethod(context, node);
      }
    },
  };
}
