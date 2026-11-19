export type PmdText = {
  readonly category: string;
  readonly description?: string;
  readonly url?: string;
  readonly renamedTo?: string;
};

export type CheckstyleText = { readonly category: string };

export type SpotbugsText = { readonly category: string; readonly anchor: string };

export type ErrorProneText = {
  readonly severity: string;
  readonly summary: string;
  readonly url: string;
  readonly tags?: string;
};

export type DetektText = { readonly description: string };

export type ToolTextRules = {
  readonly pmd: PmdText;
  readonly checkstyle: CheckstyleText;
  readonly spotbugs: SpotbugsText;
  readonly errorprone: ErrorProneText;
  readonly detekt: DetektText;
};

export type ToolText<Rule> = {
  readonly version: string;
  readonly rules: Readonly<Record<string, Rule>>;
};

export type ToolTextTool = keyof ToolTextRules;
