import path from 'node:path';
import { runJavaTool } from '../java-tool.mjs';

export function runStructure(context) {
  const { module, reportRoot, projectRoot, relative, rulesetDirectory } = context;
  runJavaTool(context, {
    label: 'StructureMetrics',
    source: path.join(rulesetDirectory, 'StructureMetrics.java'),
    args: [
      path.join(reportRoot, 'structure.json'),
      projectRoot,
      ...module.sourceRoots.map((root) => relative(root)),
    ],
  });
}
