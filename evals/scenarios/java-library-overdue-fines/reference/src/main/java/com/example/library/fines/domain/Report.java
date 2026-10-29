package com.example.library.fines.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** Lays out the overdue report. */
public final class Report {
  private Report() {}

  /**
   * Totals the fines of each member and lists those who owe something.
   *
   * @param asOf the day the report is made for
   * @param entries the fine of every loan
   * @return the lines of the report: a header, then one line per member, or a line saying nothing
   *     is overdue
   */
  public static List<String> render(LocalDate asOf, List<FineEntry> entries) {
    String header = "Overdue fines as of " + asOf;
    List<MemberTotal> ranked =
        entries.stream()
            .collect(
                Collectors.toMap(
                    FineEntry::memberId,
                    entry -> new MemberTotal(entry.name(), entry.cents()),
                    MemberTotal::plus))
            .values()
            .stream()
            .filter(total -> total.cents() > 0)
            .sorted(MemberTotal.RANKING)
            .toList();
    if (ranked.isEmpty()) {
      return List.of(header, "No overdue fines");
    }
    return Stream.concat(Stream.of(header), ranked.stream().map(MemberTotal::line)).toList();
  }
}
