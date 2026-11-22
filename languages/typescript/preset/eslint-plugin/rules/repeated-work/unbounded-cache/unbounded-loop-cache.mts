import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';
import { contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import {
  classFieldReferences,
  collectionWriteSite,
  isCollectionInitializer,
  isCollectionShrinkOrBound,
  isConstructorInit,
  isExportedDeclarator,
  type WriteSite,
} from './collection-analysis.mts';
import { dependsOnLoopElement, enclosingLoop, isBoundedLoop } from './loop-context.mts';

type LoopWrite = {
  readonly write: WriteSite;
  readonly loop: TSESTree.Node;
};

type CollectionCandidate = {
  readonly declaration: TSESTree.Node;
  readonly name: string;
  readonly refs: readonly TSESTree.Node[];
};

function qualifyingLoopWrite(
  sourceCode: SourceCode,
  declaration: TSESTree.Node,
  ref: TSESTree.Node,
): LoopWrite | undefined {
  const write = collectionWriteSite(ref);
  if (write === undefined) {
    return undefined;
  }
  const loop = enclosingLoop(ref);
  if (loop === undefined || contains(loop, declaration) || isBoundedLoop(sourceCode, loop)) {
    return undefined;
  }
  return dependsOnLoopElement(sourceCode, loop, write.payloads) ? { write, loop } : undefined;
}

function inspectCollection(
  context: TSESLint.RuleContext<'unboundedLoopCache', []>,
  candidate: CollectionCandidate,
): void {
  const { declaration, name, refs } = candidate;
  if (refs.length === 0 || refs.some(isCollectionShrinkOrBound)) {
    return;
  }
  const writes = refs
    .map((ref) => qualifyingLoopWrite(context.sourceCode, declaration, ref))
    .filter((entry): entry is LoopWrite => entry !== undefined);
  if (writes.length === 0) {
    return;
  }
  const writeLoops = writes.map((entry) => entry.loop);
  if (refs.some((ref) => !writeLoops.some((loop) => contains(loop, ref)))) {
    return;
  }
  for (const entry of writes) {
    context.report({
      node: entry.write.node,
      messageId: 'unboundedLoopCache',
      data: { name },
    });
  }
}

export const rule: TSESLint.RuleModule<'unboundedLoopCache'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow filling a long-lived collection per loop item without releasing entries',
    },
    schema: [],
    messages: {
      unboundedLoopCache:
        "Filling long-lived collection '{{name}}' per loop item without releasing entries grows memory with input size. Scope the cache to the loop iteration or evict or clear entries.",
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    return {
      VariableDeclarator(declarator) {
        if (
          declarator.id.type !== AST_NODE_TYPES.Identifier ||
          !isCollectionInitializer(declarator.init) ||
          isExportedDeclarator(declarator)
        ) {
          return;
        }
        const variable = variableNamed(context.sourceCode, declarator.id);
        const refs = (variable?.references ?? [])
          .filter((ref) => !ref.init)
          .map((ref) => ref.identifier);
        inspectCollection(context, { declaration: declarator, name: declarator.id.name, refs });
      },
      PropertyDefinition(prop) {
        if (
          prop.computed ||
          prop.static ||
          prop.key.type !== AST_NODE_TYPES.Identifier ||
          prop.parent.type !== AST_NODE_TYPES.ClassBody
        ) {
          return;
        }
        const allRefs = classFieldReferences(prop.parent, prop.key.name);
        const hasInit = isCollectionInitializer(prop.value) || allRefs.some(isConstructorInit);
        if (!hasInit) {
          return;
        }
        const refs = allRefs.filter((ref) => !isConstructorInit(ref));
        inspectCollection(context, { declaration: prop, name: prop.key.name, refs });
      },
    };
  },
};
