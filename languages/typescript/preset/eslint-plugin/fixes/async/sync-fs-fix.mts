import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { typeServices, type Context } from '../../rules/security/security-values.mts';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { importingName } from '../edits/imports.mts';
import { allOf } from '../edits/plans.mts';
import { isPlainObject, keyName } from '../support/objects.mts';
import { hasCommentIn, replacing, type FixPlan, type ReportFix } from '../support/ranges.mts';
import { isSafeAsyncSite } from './sites/async-site.mts';
import { awaiting } from './sites/await-text.mts';
import { mayBeDescriptor } from './sites/descriptor-argument.mts';
import { ACCESS_TWIN, FS_EXTRA_TWINS, FS_TWINS, type FsTwin } from './fs-twins.mts';
import { moduleCallee, type ModuleCallee } from './module-callee.mts';

type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
type Site = { readonly call: TSESTree.CallExpression; readonly fn: FunctionNode };
type Rewrite = { readonly expression: string; readonly imports: readonly FixPlan[] };
export type SyncFsFix = {
  readonly messageId: 'awaitTwin' | 'awaitAccess';
  readonly plan: ReportFix;
};

const NODE_FS = new Set(['fs', 'node:fs']);
const EXISTS = 'existsSync';
const ENTRY_OPTION = 'throwIfNoEntry';
const EXISTS_CHECK = '.then(() => true, () => false)';

function entryOptionsFit(options: TSESTree.Node | undefined): boolean {
  return (
    options === undefined ||
    (isPlainObject(options) &&
      options.properties.every((property) => keyName(property) !== ENTRY_OPTION))
  );
}

function argumentsFit(context: Context, call: TSESTree.CallExpression, twin: FsTwin): boolean {
  const [first, second] = call.arguments;
  return (
    first !== undefined &&
    call.arguments.length <= twin.maxArguments &&
    call.arguments.every((argument) => argument.type !== AST_NODE_TYPES.SpreadElement) &&
    !(twin.takesDescriptor && mayBeDescriptor(context, first)) &&
    !(twin.hasEntryOption && !entryOptionsFit(second))
  );
}

function argumentsText(sourceCode: SourceCode, call: TSESTree.CallExpression): string {
  return sourceCode.text.slice(call.callee.range[1], call.range[1]);
}

function promisesSources(module: string): string[] {
  return module === 'fs'
    ? ['fs/promises', 'node:fs/promises']
    : ['node:fs/promises', 'fs/promises'];
}

function importedTwin(
  sourceCode: SourceCode,
  site: Site,
  { module, twin }: { readonly module: string; readonly twin: FsTwin },
): { readonly imports: readonly FixPlan[] } | undefined {
  const edit = importingName(sourceCode, sourceCode.ast, {
    sources: promisesSources(module),
    name: twin.name,
    sites: [site.call],
  });
  if (edit === undefined) {
    return undefined;
  }
  return { imports: edit.present ? [] : [edit.plan] };
}

function memberRewrite(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  { callee, twin }: { readonly callee: ModuleCallee; readonly twin: FsTwin },
): Rewrite | undefined {
  if (callee.kind !== 'member') {
    return undefined;
  }
  const holder = NODE_FS.has(callee.module) ? `${callee.object}.promises` : callee.object;
  const known = NODE_FS.has(callee.module) || callee.module === 'fs-extra';
  if (!known) {
    return undefined;
  }
  const expression =
    callee.method === EXISTS && NODE_FS.has(callee.module)
      ? `${holder}.access(${sourceCode.getText(call.arguments[0])})${EXISTS_CHECK}`
      : `${holder}.${twin.name}${argumentsText(sourceCode, call)}`;
  return { expression, imports: [] };
}

function namedRewrite(
  sourceCode: SourceCode,
  site: Site,
  { callee, twin }: { readonly callee: ModuleCallee; readonly twin: FsTwin },
): Rewrite | undefined {
  if (callee.kind !== 'named' || !NODE_FS.has(callee.module)) {
    return undefined;
  }
  const found = importedTwin(sourceCode, site, { module: callee.module, twin });
  const argument = sourceCode.getText(site.call.arguments[0]);
  const expression =
    callee.method === EXISTS
      ? `${twin.name}(${argument})${EXISTS_CHECK}`
      : `${twin.name}${argumentsText(sourceCode, site.call)}`;
  return found === undefined ? undefined : { expression, imports: found.imports };
}

function twinOf(callee: ModuleCallee): FsTwin | undefined {
  if (callee.module === 'fs-extra') {
    return undefined;
  }
  if (callee.method === EXISTS && NODE_FS.has(callee.module)) {
    return ACCESS_TWIN;
  }
  const table = callee.module === 'fs-extra' ? FS_EXTRA_TWINS : FS_TWINS;
  return table.get(callee.method);
}

function rewriteOf(sourceCode: SourceCode, site: Site, callee: ModuleCallee, twin: FsTwin) {
  return callee.kind === 'member'
    ? memberRewrite(sourceCode, site.call, { callee, twin })
    : namedRewrite(sourceCode, site, { callee, twin });
}

export function syncFsFix(context: Context, site: Site): SyncFsFix | undefined {
  const { call, fn } = site;
  const { sourceCode } = context;
  const callee = moduleCallee(context, call);
  const twin = callee === undefined ? undefined : twinOf(callee);
  if (
    callee === undefined ||
    twin === undefined ||
    call.optional ||
    call.typeArguments !== undefined ||
    hasCommentIn(sourceCode, call.range) ||
    !argumentsFit(context, call, twin) ||
    !isSafeAsyncSite(context, call, fn)
  ) {
    return undefined;
  }
  const rewrite = rewriteOf(sourceCode, site, callee, twin);
  const text = rewrite === undefined ? undefined : awaiting(sourceCode, call, rewrite.expression);
  const plan =
    rewrite === undefined || text === undefined
      ? undefined
      : allOf([...rewrite.imports, replacing(call.range, text)]);
  return plan === undefined
    ? undefined
    : { messageId: twin === ACCESS_TWIN ? 'awaitAccess' : 'awaitTwin', plan };
}
