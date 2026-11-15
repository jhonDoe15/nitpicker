import {
  nestedCheckout as untypedNestedCheckout,
  useGitCheckouts as untypedUseGitCheckouts,
} from '../../../../../core/diff/git/test-support/git-checkout.mts';
import { textOf } from '../../../../../shared/values/readers.mts';

type Files = Record<string, string>;

const { gitCheckout: untypedGitCheckout } = untypedUseGitCheckouts();

export const nestedCheckout: (directory: string, files: Files) => Files = untypedNestedCheckout;

export function gitCheckout(files: Files, ignored?: string[]): string {
  return textOf(Reflect.apply(untypedGitCheckout, undefined, [files, ignored]));
}
