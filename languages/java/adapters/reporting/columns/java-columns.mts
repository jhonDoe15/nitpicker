import { readFileSync } from 'node:fs';
import { withUtf16Columns } from '../../../../../shared/ingest/columns/utf16-columns.mjs';
import { toolConfigChoices } from '../../tool-config/tool-config-choices.mts';
import {
  type JavaFinding,
  type JavaPolicy,
  type SourceReader,
  findingsOf,
} from '../../typed/java-values.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';

const DEFAULT_TAB_WIDTH = 8;
const TAB_WIDTH_PROPERTY = /<property\s+name\s*=\s*["']tabWidth["']\s+value\s*=\s*["'](\d+)["']/u;

export function checkstyleTabWidth(configText: string | undefined): number {
  const width = Number(TAB_WIDTH_PROPERTY.exec(configText ?? '')?.[1]);
  return width >= 1 ? width : DEFAULT_TAB_WIDTH;
}

export function withJavaColumns(
  findings: readonly JavaFinding[],
  {
    projectRoot,
    policy,
    readSource,
  }: {
    readonly projectRoot: string;
    readonly policy: JavaPolicy | undefined;
    readonly readSource: SourceReader;
  },
): JavaFinding[] {
  const choices: unknown = toolConfigChoices(projectRoot, policy);
  const project = fieldOf(fieldOf(choices, 'checkstyle'), 'project');
  const tabWidth = checkstyleTabWidth(
    typeof project === 'string' ? readFileSync(project, 'utf8') : undefined,
  );
  return findingsOf(
    withUtf16Columns(findings, {
      units: { checkstyle: { unit: 'checkstyle-tab-stops', tabWidth }, errorprone: 'tab-stops' },
      readSource,
    }),
  );
}
