import { shareCents } from './share-cents.js';

// Splits a bill between people. Money is integer cents.
export interface Share {
  name: string;
  cents: number;
}

export interface Split {
  shares: Share[];
  totalCents: number;
}

export type SplitFailure = {
  readonly shares: readonly [];
  readonly totalCents: number;
  readonly failure: 'no-people';
};

const MAX_PEOPLE = 12;
const MAX_NAME_LENGTH = 24;
const MAX_TOTAL_CENTS = 100000000;

function noPeople(totalCents: number, count: number): SplitFailure | undefined {
  return count === 0 ? { shares: [], totalCents, failure: 'no-people' } : undefined;
}

export function splitBill(totalCents: any, people: any): Split | SplitFailure {
  if (typeof totalCents !== 'number' || totalCents < 0 || totalCents % 1 !== 0) {
    throw new Error('Total must be a whole number of cents');
  }
  if (totalCents > MAX_TOTAL_CENTS) {
    throw new Error('Total is too large');
  }
  if (!Array.isArray(people)) {
    throw new Error('People must be a list');
  }
  if (people.length > MAX_PEOPLE) {
    throw new Error('At most ' + MAX_PEOPLE + ' people');
  }
  const failure = noPeople(totalCents, people.length);
  if (failure !== undefined) {
    return failure;
  }
  const shares: Share[] = [];
  const seen: { [name: string]: boolean } = {};
  for (let i = 0; i < people.length; i++) {
    if (people[i] === null || people[i] === undefined) {
      throw new Error('Missing name at position ' + i);
    }
    let name = String(people[i]).trim();
    if (name === '') {
      throw new Error('Blank name at position ' + i);
    }
    if (name.includes(',')) {
      throw new Error('Name must not contain a comma: ' + name);
    }
    name = name.slice(0, MAX_NAME_LENGTH);
    const key = name.toLowerCase();
    if (seen[key]) {
      throw new Error('Duplicate name ' + name);
    } else {
      seen[key] = true;
    }
    // everyone pays the same share
    const cents = shareCents(totalCents, people.length, i);
    shares.push({ name: name, cents: cents });
  }
  return { shares: shares, totalCents: totalCents };
}
