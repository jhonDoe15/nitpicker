import { mutantsData } from '../../test-support/mutmut-project.mts';

export function uncheckedData(count: number): string {
  return mutantsData(...Array.from({ length: count }, () => 0)).replaceAll(':0', ':null');
}

export const NOTHING_COLLECTED = {
  'mutants-data.json': uncheckedData(1),
  'mutmut-exit.txt': '1\n',
  'mutmut-output.txt': 'no tests ran in 0.08s\nfailed to collect stats. runner returned 5\n',
};
