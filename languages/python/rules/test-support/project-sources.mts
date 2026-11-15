import { type ScriptFiles, createScripts } from './python-rule-scripts.mts';

type ProjectScripts = ReturnType<typeof createScripts> & {
  only: (rule: string, files: ScriptFiles) => string[];
  dataOf: (rule: string, files: ScriptFiles) => [string, unknown][];
};

export function createProjectScripts(): ProjectScripts {
  const scripts = createScripts();
  function only(rule: string, files: ScriptFiles): string[] {
    return scripts.findingsOf(files).filter((finding) => finding.startsWith(`${rule} `));
  }
  function dataOf(rule: string, files: ScriptFiles): [string, unknown][] {
    return scripts
      .reportOf(files)
      .filter((entry) => entry.rule === rule)
      .map(({ subject, data }): [string, unknown] => [subject, data]);
  }
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
