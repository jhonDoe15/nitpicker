import { findingFactory } from '../../review-finding.mjs';

type FindingInput = {
  rule: string;
  file: string;
  line: number;
  message: string;
};

type FindingFields = FindingInput & { symbol: unknown; key: unknown; allowedForm: unknown };

const makeFinding: () => (input: FindingFields) => { message: string } = findingFactory;

export function routedMessage(input: FindingInput): string {
  return makeFinding()({ ...input, symbol: undefined, key: undefined, allowedForm: undefined })
    .message;
}
