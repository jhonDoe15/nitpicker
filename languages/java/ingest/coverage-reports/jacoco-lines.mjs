import { childrenNamed } from '../../../../shared/ingest/common.mjs';

function lineUnit(line) {
  const number = Number.parseInt(line.attrs.nr, 10);
  const [missedInstructions, coveredInstructions, missedBranches, coveredBranches] = [
    'mi',
    'ci',
    'mb',
    'cb',
  ].map((key) => Number.parseInt(line.attrs[key], 10) || 0);
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

export function jacocoLineUnits(report) {
  const byFile = new Map();
  for (const pkg of childrenNamed(report, 'package')) {
    for (const sourcefile of childrenNamed(pkg, 'sourcefile')) {
      const file = [pkg.attrs.name, sourcefile.attrs.name].filter(Boolean).join('/');
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
