import type { KotlinFile } from './kotlin-fact-types.mts';

export type FindingInput = {
  tool?: string;
  rule: string;
  file: string;
  line: number;
  symbol: string;
  key?: string | undefined;
  message: string | undefined;
  allowedForm?: string | undefined;
};

export type ReviewFinding = {
  tool: string;
  rule: string;
  path: string;
  identity: string;
  symbol: string;
  location: { line: number };
  message: string;
  allowedForm?: string;
  classification: string;
};

export type FindingFactory = (input: FindingInput) => ReviewFinding;

export type RuleOptions = {
  finding: FindingFactory;
  declaredIn?: KotlinFile[];
};
