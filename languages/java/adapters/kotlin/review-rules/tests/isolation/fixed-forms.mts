export const HEAD = String.raw`(?<![\w.\x60])(?:[a-z]\w*\s*\.\s*)*`;

type FixedForm = { pattern: RegExp; family: string };

export function fixedForms(sources: [RegExp, string][]): FixedForm[] {
  return sources.map(([source, family]) => ({
    pattern: new RegExp(`${HEAD}${source.source}`, 'gu'),
    family,
  }));
}
