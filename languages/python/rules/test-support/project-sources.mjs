import { createScripts } from './python-script-helpers.mjs';

export function createProjectScripts() {
  const scripts = createScripts();
  const only = (rule, files) =>
    scripts.findingsOf(files).filter((finding) => finding.startsWith(`${rule} `));
  const dataOf = (rule, files) =>
    scripts
      .reportOf(files)
      .filter((entry) => entry.rule === rule)
      .map(({ subject, data }) => [subject, data]);
  return { ...scripts, only, dataOf };
}

export const STATUS = `import enum


class Status(enum.Enum):
    NEW = 1
    PAID = 2
    SHIPPED = 3
`;

export const PRICING =
  'def compute(amount: int, rate: int = 2, *, cents: bool = False) -> int:\n    return amount\n';
