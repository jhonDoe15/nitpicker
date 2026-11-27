import java.time.*;
import java.util.UUID;
import static java.time.LocalDate.parse;

class F44Ap1 {
  static final String BAD = "2020-13-01";
  static final String PART = "2020-02-";
  final String notStatic = "10:61";

  void f(String s) {
    Duration.parse("PT1H2X");
    Duration.parse("P9223372036854775807D");
    Duration.parse("pt1h");
    Duration.parse("P0Dt");
    Instant.parse("2007-12-03T10:15:30");
    Instant.parse("2007-02-30T10:15:30Z");
    LocalDate.parse(BAD);
    LocalDate.parse(PART + "30");
    LocalDate.parse("2023-02-29");
    LocalDate.parse("2024-02-29");
    LocalDate.parse(s);
    parse("2020-1-1");
    LocalDateTime.parse("2020-01-01t25:00");
    LocalTime.parse(notStatic);
    LocalTime.parse("24:00");
    MonthDay.parse("--02-30");
    OffsetDateTime.parse("2020-01-01T00:00+19:00");
    OffsetDateTime.parse("2020-01-01T00:00+24");
    OffsetTime.parse("10:15:30+1");
    Period.parse("P2147483648D");
    Period.parse("P1000000000W");
    Year.parse("1000000000");
    Year.parse("+2020");
    YearMonth.parse("2020-13");
    ZonedDateTime.parse("2020-01-01T00:00Z[Europe/Pariss]");
    ZonedDateTime.parse("2020-01-01T00:00Z[UTC+25:00]");
    ZonedDateTime.parse("2020-01-01T00:00+01:00[Europe/Paris]");
    LocalDate.parse("2020-01-01 and then some more text that makes this longer than sixty-four characters");
    UUID.fromString("123e4567-e89b-12d3-a456-4266141740000");
    UUID.fromString("1-2-3-4");
    UUID.fromString("1-2-3-4-");
    UUID.fromString("1-2-3-4-x");
    UUID.fromString("١-2-3-4-5");
    UUID.fromString("123e4567-e89b-12d3-a456-426614174000");
  }
}
