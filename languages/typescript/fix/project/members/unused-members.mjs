import { ts } from '../../../typescript-api/typescript-api.mjs';
import { exceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { isReactProject } from '../../../preset/eslint-config/scope-support.mjs';
import { createContext } from '../../../preset/unused-api/context.mjs';
import { unusedApiFindings } from '../../../preset/unused-api/findings.mjs';
import { collectReferences } from '../../../preset/unused-api/references/references.mjs';
import {
  collectTargets,
  registerWrapperAliases,
} from '../../../preset/unused-api/syntax/declarations.mjs';
import { loadPackages } from '../../../preset/unused-api/workspace/packages.mjs';
import { declined, replaceEdit } from '../edits/text-edits.mjs';
import { verifyEdits } from '../edits/verify-edits.mjs';
import { layoutOf, withProject } from '../model/project-model.mjs';
import { recordPlan } from '../plan/record-plan.mjs';

const RULES = { 'unused-prop': 'component', 'unused-option': 'function' };

function registryOf(context, project) {
  const layout = layoutOf(context.inputs);
  const react = isReactProject({
    projectRoot: context.projectRoot,
    react: context.inputs?.headPolicy?.react,
    javascript: layout.javascript,
  });
  const packagesInfo = loadPackages(context.projectRoot, layout);
  const shared = createContext({
    program: project.program,
    projectRoot: context.projectRoot,
    layout,
    packagesInfo,
  });
  const analysis = { ...shared, react };
  const registry = collectTargets(analysis);
  registerWrapperAliases(analysis, registry);
  collectReferences(analysis, registry);
  const isExcepted = exceptionMatcher(context.inputs?.headPolicy?.exceptions ?? []);
  return {
    registry,
    findings: unusedApiFindings(registry, {
      owned: analysis.owned,
      analyzerName: 'structure',
      isExcepted,
    }),
  };
}

function functionNodeOf(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement;
    }
    const [only] = ts.isVariableStatement(statement) ? statement.declarationList.declarations : [];
    const init = only?.initializer;
    if (
      only !== undefined &&
      ts.isIdentifier(only.name) &&
      only.name.text === name &&
      init !== undefined
    ) {
      return ts.isArrowFunction(init) || ts.isFunctionExpression(init) ? init : undefined;
    }
  }
  return undefined;
}

function removeMember(project, declaration) {
  const sourceFile = declaration.getSourceFile();
  const { text } = sourceFile;
  const name = project.nameOf(sourceFile.fileName);
  const first = declaration.getStart(sourceFile, true);
  const lineStart = text.lastIndexOf('\n', first - 1) + 1;
  if (text.slice(lineStart, first).trim() === '') {
    const end = text[declaration.end] === '\n' ? declaration.end + 1 : declaration.end;
    return replaceEdit(name, [lineStart, end], '');
  }
  const start = first - (text.slice(0, first).length - text.slice(0, first).trimEnd().length);
  return replaceEdit(name, [start, declaration.end], '');
}

function destructuringEdit(project, { target, member }) {
  const sourceFile = project.sourceFile(target.path);
  const fn = functionNodeOf(sourceFile, target.name);
  const patterns = (fn?.parameters ?? []).map(({ name }) => name).filter(ts.isObjectBindingPattern);
  for (const pattern of patterns) {
    const element = pattern.elements.find(
      ({ name, propertyName }) => (propertyName ?? name).getText() === member,
    );
    if (element !== undefined) {
      const kept = pattern.elements
        .filter((each) => each !== element)
        .map((each) => each.getText());
      return kept.length === 0
        ? { declined: 'it is the only property' }
        : {
            edit: replaceEdit(
              target.path,
              [pattern.getStart(), pattern.end],
              `{ ${kept.join(', ')} }`,
            ),
          };
    }
  }
  return {};
}

function planFinding(context, project, { target, member, memberDeclaration }) {
  const own = destructuringEdit(project, { target, member });
  if (own.declined !== undefined) {
    return declined(`${target.name}.${member} ${own.declined}`);
  }
  const removal = removeMember(project, memberDeclaration);
  if (![removal.path, target.path].every((name) => context.accepts(name))) {
    return declined('the type sits in a file --fix does not cover');
  }
  const edits = [removal, ...(own.edit === undefined ? [] : [own.edit])];
  const unsafe = verifyEdits(context, project, edits);
  return unsafe === undefined ? { edits } : declined(unsafe);
}

function targetFor(registry, { name, finding, kind }) {
  for (const candidate of registry.targets) {
    if (candidate.name === name && candidate.path === finding.path && candidate.kind === kind) {
      return candidate;
    }
  }
  return undefined;
}

function recipeFor(rule) {
  return {
    id: `typescript-${rule}`,
    rules: [{ tool: 'structure', rule }],
    presets: ['typescript', 'javascript'],
    scope: 'project',
    safety: 'review',
    plan(context) {
      const changed = new Set(context.files.map(({ path }) => path));
      return withProject(context, (project) => {
        const { registry, findings } = registryOf(context, project);
        const result = { fixes: [], notes: [] };
        for (const finding of findings.filter(
          (found) => found.rule === rule && changed.has(found.path),
        )) {
          const [name, member] = finding.symbol.split('.');
          const target = targetFor(registry, { name, finding, kind: RULES[rule] });
          const line = finding.location?.line ?? 1;
          const planned = planFinding(context, project, {
            target,
            member,
            memberDeclaration: target.members.get(member),
          });
          const located = { tool: finding.tool, rule, path: finding.path, line };
          recordPlan(result, { planned, finding: located, rule });
        }
        return result;
      });
    },
  };
}

export const unusedPropRecipe = recipeFor('unused-prop');
export const unusedOptionRecipe = recipeFor('unused-option');
