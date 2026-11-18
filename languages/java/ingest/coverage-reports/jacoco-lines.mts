import { childrenNamed } from '../../../../shared/values/xml.mts';
import type { XmlElement } from '../../../../shared/values/xml.mts';
import type { CoverageUnit } from '../units/unit-types.mts';

export function joinedPath(...parts: readonly (string | undefined)[]): string {
  return parts.filter((part) => part !== undefined && part !== '').join('/');
}

function lineUnit(line: XmlElement): CoverageUnit {
  const number = Number.parseInt(line.attrs['nr'] ?? '', 10);
  const [missedInstructions = 0, coveredInstructions = 0, missedBranches = 0, coveredBranches = 0] =
    ['mi', 'ci', 'mb', 'cb'].map((key) => Number.parseInt(line.attrs[key] ?? '', 10) || 0);
  return {
    name: '<line>',
    className: '',
    line: number,
    lines: {
      covered: coveredInstructions > 0 ? 1 : 0,
      total: missedInstructions + coveredInstructions > 0 ? 1 : 0,
    },
    branches: { covered: coveredBranches, total: missedBranches + coveredBranches },
  };
}

export function jacocoLineUnits(report: XmlElement): Map<string, CoverageUnit[]> {
  const byFile = new Map<string, CoverageUnit[]>();
  for (const pkg of childrenNamed(report, 'package')) {
    for (const sourcefile of childrenNamed(pkg, 'sourcefile')) {
      const file = joinedPath(pkg.attrs['name'], sourcefile.attrs['name']);
      byFile.set(
        file,
        childrenNamed(sourcefile, 'line')
          .map(lineUnit)
          .filter(({ line }) => Number.isInteger(line)),
      );
    }
  }
  return byFile;
}
