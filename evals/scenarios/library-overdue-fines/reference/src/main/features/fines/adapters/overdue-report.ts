import { dailyFineRateCents } from '../../catalog/index.js';
import type { Catalog } from '../../catalog/index.js';
import { daysLate } from '../../loans/index.js';
import type { LoanRepository } from '../../loans/index.js';
import type { Directory } from '../../members/index.js';
import { fineCents } from '../domain/fine.js';
import type { FineEntry } from '../domain/report.js';
import { renderReport } from '../domain/report.js';

type FineSources = {
  readonly catalog: Catalog;
  readonly members: Directory;
  readonly loans: LoanRepository;
};

export function overdueReportLines(sources: FineSources, asOf: string): readonly string[] {
  const entries = sources.loans.all().flatMap((loan): readonly FineEntry[] => {
    const book = sources.catalog.find(loan.bookId);
    const member = sources.members.find(loan.memberId);
    if (book === undefined || member === undefined) {
      return [];
    }
    const cents = fineCents({
      dailyRateCents: dailyFineRateCents(book),
      daysLate: daysLate(loan, asOf),
      tier: member.tier,
    });
    return [{ memberId: member.id, name: member.name, cents }];
  });
  return renderReport(asOf, entries);
}
