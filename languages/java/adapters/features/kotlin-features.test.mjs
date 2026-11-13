import { afterEach, describe, expect, it } from 'vitest';
import { featureProjects, projectFindings, rows } from './test-support/feature-project.mjs';

const { project: featureProject, remove } = featureProjects();

afterEach(remove);

const FEATURES = 'com.acme.features';
const FOLDER = 'src/main/kotlin/com/acme/features';

function kotlinFile(qualifiedName, body) {
  const index = qualifiedName.lastIndexOf('.');
  const folder = qualifiedName.slice(0, index).replaceAll('.', '/');
  return {
    [`src/main/kotlin/${folder}/${qualifiedName.slice(index + 1)}.kt`]: `package ${qualifiedName.slice(0, index)}\n\n${body}\n`,
  };
}

describe('feature cycles of Kotlin features', () => {
  it('reports each edge of a cycle of two Kotlin features, through a class and a file facade', () => {
    const project = featureProject({
      files: {
        ...kotlinFile(`${FEATURES}.billing.Invoice`, 'class Invoice'),
        ...kotlinFile(`${FEATURES}.shipping.Rates`, 'fun rate(): Int = 1'),
      },
      modules: [
        {
          classes: [`${FEATURES}.billing.Invoice`, `${FEATURES}.shipping.RatesKt`],
          edges: [
            [`${FEATURES}.billing.Invoice`, `${FEATURES}.shipping.RatesKt`],
            [`${FEATURES}.shipping.RatesKt`, `${FEATURES}.billing.Invoice`],
          ],
        },
      ],
    });

    expect(rows(projectFindings(project, { kotlin: true }))).toEqual([
      ['feature-cycle', `${FOLDER}/billing/Invoice.kt`, `${FOLDER}/shipping|feature-cycle`],
      ['feature-cycle', `${FOLDER}/shipping/Rates.kt`, `${FOLDER}/billing|feature-cycle`],
    ]);
  });

  it('reports no cycle for one feature split over the Java and the Kotlin source root', () => {
    const project = featureProject({
      files: {
        'src/main/java/com/acme/features/billing/Invoice.java': `package ${FEATURES}.billing;\n\npublic class Invoice {}\n`,
        ...kotlinFile(`${FEATURES}.billing.Totals`, 'fun total(): Int = 1'),
      },
      modules: [
        {
          classes: [`${FEATURES}.billing.Invoice`, `${FEATURES}.billing.TotalsKt`],
          edges: [
            [`${FEATURES}.billing.Invoice`, `${FEATURES}.billing.TotalsKt`],
            [`${FEATURES}.billing.TotalsKt`, `${FEATURES}.billing.Invoice`],
          ],
        },
      ],
    });

    expect(projectFindings(project, { kotlin: true })).toEqual([]);
  });
});
