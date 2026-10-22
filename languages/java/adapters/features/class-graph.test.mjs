import { afterEach, describe, expect, it } from 'vitest';
import { readClassGraph } from './class-graph.mjs';
import { featureFacts } from './feature-findings.mjs';
import { featureProjects, javaSources } from './test-support/feature-project.mjs';

const { project: featureProject, remove } = featureProjects();

afterEach(remove);

function fileEdges(graph) {
  return graph.edges.map(({ source, target }) => `${source.file} -> ${target.file}`);
}

const BILLING = 'com.acme.features.billing';
const SHIPPING = 'com.acme.features.shipping';

describe('readClassGraph', () => {
  it('maps nested classes to their outer class file and keeps library edges apart', () => {
    const { root, projects } = featureProject({
      files: javaSources([`${BILLING}.Invoice`, `${SHIPPING}.internal.Writer`]),
      modules: [
        {
          classes: [`${BILLING}.Invoice`, `${BILLING}.Invoice$Line`, `${SHIPPING}.internal.Writer`],
          edges: [
            [`${BILLING}.Invoice$Line`, `${SHIPPING}.internal.Writer$Batch`],
            [`${BILLING}.Invoice`, `${BILLING}.Invoice$Line`],
            [`${BILLING}.Invoice`, 'java.sql.Connection'],
          ],
        },
      ],
    });

    const graph = readClassGraph(root, projects);

    expect(fileEdges(graph)).toEqual([
      'src/main/java/com/acme/features/billing/Invoice.java -> src/main/java/com/acme/features/shipping/internal/Writer.java',
    ]);
    expect(graph.libraryEdges.map(({ source, library }) => [source.name, library])).toEqual([
      [`${BILLING}.Invoice`, 'java.sql.Connection'],
    ]);
  });

  it('finds Kotlin classes and file facades from the sources, so mixed Java and Kotlin edges stay', () => {
    const { root, projects } = featureProject({
      files: {
        ...javaSources([`${BILLING}.Invoice`]),
        'src/main/kotlin/com/acme/features/shipping/internal/Rates.kt': `package ${SHIPPING}.internal\n\nfun rate(): Int = 1\n\nclass Table\n`,
      },
      modules: [
        {
          classes: [
            `${BILLING}.Invoice`,
            `${SHIPPING}.internal.RatesKt`,
            `${SHIPPING}.internal.Table`,
          ],
          edges: [
            [`${BILLING}.Invoice`, `${SHIPPING}.internal.RatesKt`],
            [`${SHIPPING}.internal.Table`, `${BILLING}.Invoice`],
          ],
        },
      ],
    });

    expect(fileEdges(readClassGraph(root, projects))).toEqual([
      'src/main/java/com/acme/features/billing/Invoice.java -> src/main/kotlin/com/acme/features/shipping/internal/Rates.kt',
      'src/main/kotlin/com/acme/features/shipping/internal/Rates.kt -> src/main/java/com/acme/features/billing/Invoice.java',
    ]);
  });

  it('prefers the Kotlin PSI file of a class, such as a part of a multifile facade', () => {
    const file = 'src/main/kotlin/shipping/Rates.kt';
    const { root, projects } = featureProject({
      files: { ...javaSources([`${BILLING}.Invoice`]), [file]: `package ${SHIPPING}\n` },
      modules: [
        {
          classes: [`${BILLING}.Invoice`, `${SHIPPING}.RatesKt__RatesKt`],
          edges: [[`${BILLING}.Invoice`, `${SHIPPING}.RatesKt__RatesKt`]],
          kotlinMetrics: {
            functions: [],
            files: [{ file, package: SHIPPING, classes: [`${SHIPPING}.RatesKt__RatesKt`] }],
          },
        },
      ],
    });

    expect(fileEdges(readClassGraph(root, projects))).toEqual([
      `src/main/java/com/acme/features/billing/Invoice.java -> ${file}`,
    ]);
  });

  it('follows edges across modules and drops classes without a source file or with two owners', () => {
    const { root, projects } = featureProject({
      files: {
        ...javaSources([`${BILLING}.Invoice`, 'com.acme.Twin'], 'billing/src/main/java'),
        ...javaSources([`${SHIPPING}.internal.Writer`, 'com.acme.Twin'], 'shipping/src/main/java'),
      },
      modules: [
        {
          qualifier: 'billing',
          classes: [`${BILLING}.Invoice`, `${BILLING}.InvoiceMapperImpl`, 'com.acme.Twin'],
          edges: [
            [`${BILLING}.Invoice`, `${SHIPPING}.internal.Writer`],
            [`${BILLING}.Invoice`, `${BILLING}.InvoiceMapperImpl`],
          ],
        },
        {
          qualifier: 'shipping',
          classes: [`${SHIPPING}.internal.Writer`, 'com.acme.Twin', 'com.acme.Other'],
          edges: [[`${SHIPPING}.internal.Writer`, 'com.acme.Twin']],
        },
        {
          qualifier: 'reporting',
          classes: ['com.acme.Report'],
          edges: [['com.acme.Report', 'com.acme.Twin']],
        },
      ],
    });

    const graph = readClassGraph(root, projects);

    expect(fileEdges(graph)).toEqual([
      'billing/src/main/java/com/acme/features/billing/Invoice.java -> shipping/src/main/java/com/acme/features/shipping/internal/Writer.java',
      'shipping/src/main/java/com/acme/features/shipping/internal/Writer.java -> shipping/src/main/java/com/acme/Twin.java',
    ]);
    expect(graph.libraryEdges).toEqual([]);
  });

  it('builds file-level facts with the imported class names and no edge inside one file', () => {
    const { root, projects } = featureProject({
      files: {
        ...javaSources([`${BILLING}.Invoice`, `${SHIPPING}.Api`]),
        'src/main/java/com/acme/features/shipping/Api.java': `package ${SHIPPING};\n\npublic class Api {}\n\nclass Helper {}\n`,
      },
      modules: [
        {
          classes: [`${BILLING}.Invoice`, `${SHIPPING}.Api`, `${SHIPPING}.Helper`],
          edges: [
            [`${BILLING}.Invoice`, `${SHIPPING}.Api`],
            [`${BILLING}.Invoice`, `${SHIPPING}.Helper`],
            [`${SHIPPING}.Api`, `${SHIPPING}.Helper`],
          ],
        },
      ],
    });

    expect(featureFacts(readClassGraph(root, projects))).toEqual({
      modules: [
        { file: 'src/main/java/com/acme/features/billing/Invoice.java', role: 'production' },
        { file: 'src/main/java/com/acme/features/shipping/Api.java', role: 'production' },
      ],
      imports: [
        {
          from: 'src/main/java/com/acme/features/billing/Invoice.java',
          to: 'src/main/java/com/acme/features/shipping/Api.java',
          names: [{ name: 'Api' }, { name: 'Helper' }],
        },
      ],
    });
  });

  it('reads nothing from a module whose jdeps reports are missing', () => {
    const { root, projects } = featureProject({ modules: [{ classes: [] }] });

    expect(
      readClassGraph(root, [{ ...projects[0], reportRoot: `${root}/missing` }]).classes,
    ).toEqual([]);
  });
});
