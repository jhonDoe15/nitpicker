import type { Language } from '../../common/types.mts';
import { maskCLike } from './c-like.mts';
import type { Masked } from './lines.mts';
import { maskPython } from './python.mts';

const LANGUAGES = new Map<string, Language>([
  ['.py', 'python'],
  ['.pyi', 'python'],
  ['.java', 'java'],
  ['.kt', 'kotlin'],
  ['.kts', 'kotlin'],
]);

export function languageOf(file: string): Language | undefined {
  const extension = /\.[^./]+$/u.exec(file)?.[0];
  return extension === undefined ? undefined : LANGUAGES.get(extension);
}

export function maskSource(
  language: Language,
  text: string,
  { keepStrings = false }: { keepStrings?: boolean } = {},
): Masked {
  return language === 'python'
    ? maskPython(text, { keepStrings })
    : maskCLike(text, { kotlin: language === 'kotlin', keepStrings });
}
