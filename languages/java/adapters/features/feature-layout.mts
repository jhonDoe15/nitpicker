import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { SPRING_ARCH_REPORT } from '../spring-arch/spring-arch.mjs';
import { featureUnits } from './feature-units.mts';
import { byText as byTextUntyped } from '../../../../shared/text-order/by-text.mjs';
import { fieldOf, listOf, parseJson, textOf } from '../../../../shared/values/readers.mts';
import type { ClassEntry, ClassProject, ResolvedGraph } from '../domain/domain-types.mts';
import type { FeatureLayout, FeaturePlan, SpringReport } from './feature-types.mts';

const byText: (left: string, right: string) => number = byTextUntyped;

export const SPRING_LAYER_PACKAGES = [
  'controller',
  'controllers',
  'service',
  'services',
  'repository',
  'repositories',
  'entity',
  'entities',
  'model',
  'models',
  'dto',
  'dtos',
  'dao',
  'daos',
  'util',
  'utils',
  'common',
  'web',
  'api',
  'rest',
  'resource',
  'resources',
  'persistence',
  'domain',
  'mapper',
  'mappers',
  'exception',
  'exceptions',
  'adapter',
  'adapters',
  'application',
  'infrastructure',
  'infra',
  'port',
  'ports',
  'usecase',
  'usecases',
  'helper',
  'helpers',
];
const SHARED_PACKAGE = 'shared';
const ARCHUNIT_EDGE_RULES = new Set(['spring-feature-boundary', 'spring-shared-pure']);
const GLOB_CHARACTERS = /[\\*?{}[\]]/gu;

export function readSpringReports(projects: readonly ClassProject[]): SpringReport[] {
  return projects.flatMap((project) => {
    const file = path.join(project.reportRoot, SPRING_ARCH_REPORT);
    if (!existsSync(file)) {
      return [];
    }
    const report = parseJson(readFileSync(file, 'utf8'));
    return [
      {
        qualifier: project.qualifier,
        root: fieldOf(report, 'root'),
        violations: listOf(fieldOf(report, 'violations')).map((violation) => ({
          rule: textOf(fieldOf(violation, 'rule')),
          detail: textOf(fieldOf(violation, 'detail')),
          className: textOf(fieldOf(violation, 'className')),
        })),
      },
    ];
  });
}

function rootFolder(
  root: string,
  { packageName, file }: Pick<ClassEntry, 'packageName' | 'file'>,
): string[] {
  const suffix = packageName.slice(root.length).replaceAll('.', '/');
  const folder = path.posix.dirname(file);
  return folder.endsWith(suffix) && (packageName === root || packageName.startsWith(`${root}.`))
    ? [folder.slice(0, folder.length - suffix.length)]
    : [];
}

export function springRootFolders(
  roots: readonly string[],
  classes: readonly Pick<ClassEntry, 'packageName' | 'file'>[],
): string[] {
  return [
    ...new Set(roots.flatMap((root) => classes.flatMap((entry) => rootFolder(root, entry)))),
  ].toSorted(byText);
}

function literalGlob(folder: string): string {
  return folder.replaceAll(GLOB_CHARACTERS, (character) => `\\${character}`);
}

function springLayout(folders: readonly string[], layout: FeatureLayout): FeatureLayout {
  const globs = folders.map(literalGlob);
  return {
    featureRoots: globs,
    sharedRoots: layout.sharedRoots ?? globs.map((glob) => `${glob}/${SHARED_PACKAGE}`),
    notFeatures: [SHARED_PACKAGE, ...SPRING_LAYER_PACKAGES],
  };
}

function coveredEdges(
  reports: readonly SpringReport[],
  resolve: ResolvedGraph['resolve'],
): Set<string> {
  return new Set(
    reports.flatMap(({ qualifier, violations }) =>
      violations
        .filter(({ rule, detail }) => ARCHUNIT_EDGE_RULES.has(rule) && detail !== '')
        .flatMap(({ className, detail }) => {
          const from = resolve(qualifier, className)?.file;
          const to = resolve(qualifier, detail)?.file;
          return from === undefined || to === undefined ? [] : [`${from}\0${to}`];
        }),
    ),
  );
}

export function featurePlan(
  layout: FeatureLayout,
  reports: readonly SpringReport[],
  graph: ResolvedGraph,
): FeaturePlan {
  const roots = reports.map(({ root }) => root).filter((root) => typeof root === 'string');
  const folders = layout.featureRoots === undefined ? springRootFolders(roots, graph.classes) : [];
  const covered = coveredEdges(reports, graph.resolve);
  if (folders.length > 0) {
    return {
      layout: featureUnits(springLayout(folders, layout), { classes: graph.classes, roots }),
      boundaryRules: layout.sharedRoots === undefined ? [] : [RULE_IDS.sharedImportsFeature],
      covered,
    };
  }
  const { sharedRoots, featureRoots } = layout;
  return {
    layout: featureUnits(
      {
        ...(sharedRoots === undefined ? {} : { sharedRoots }),
        ...(featureRoots === undefined ? {} : { featureRoots }),
      },
      { classes: graph.classes },
    ),
    boundaryRules: [RULE_IDS.featureInternalImport, RULE_IDS.sharedImportsFeature],
    covered,
  };
}
