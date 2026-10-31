import { readFileSync } from 'node:fs';
import { withUtf16Columns } from '../../../../../shared/ingest/columns/utf16-columns.mjs';
import { toolConfigChoices } from '../../tool-config/tool-config-choices.mjs';

const DEFAULT_TAB_WIDTH = 8;
const TAB_WIDTH_PROPERTY = /<property\s+name\s*=\s*["']tabWidth["']\s+value\s*=\s*["'](\d+)["']/u;

export function checkstyleTabWidth(configText) {
  const width = Number(TAB_WIDTH_PROPERTY.exec(configText ?? '')?.[1]);
  return width >= 1 ? width : DEFAULT_TAB_WIDTH;
}

export function withJavaColumns(findings, { projectRoot, policy, readSource }) {
  const { project } = toolConfigChoices(projectRoot, policy).checkstyle;
  const tabWidth = checkstyleTabWidth(
    project === undefined ? undefined : readFileSync(project, 'utf8'),
  );
  return withUtf16Columns(findings, {
    units: { checkstyle: { unit: 'checkstyle-tab-stops', tabWidth }, errorprone: 'tab-stops' },
    readSource,
  });
}
