import { collectArchitectureReports } from './measure/architecture-reports.mjs';
import { runJacocoReport } from './measure/jacoco-report.mjs';
import { runPit } from './measure/pit.mjs';
import { runCheckstyle } from './lint/checkstyle.mjs';
import { runFormat } from './lint/format.mjs';
import { runPmd } from './lint/pmd.mjs';
import { runSpotbugs } from './lint/spotbugs.mjs';
import { writeManifest } from './manifest.mjs';
import { runJdeps } from './structure/jdeps.mjs';
import { runStructure } from './structure/structure.mjs';

export const MODULE_STEPS = [
  runPmd,
  runSpotbugs,
  runFormat,
  runCheckstyle,
  runJacocoReport,
  collectArchitectureReports,
  runStructure,
  runJdeps,
  runPit,
  writeManifest,
];
