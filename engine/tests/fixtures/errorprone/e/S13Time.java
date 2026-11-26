package e;

import static java.time.LocalDate.ofEpochDay;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Month;
import java.time.MonthDay;
import java.time.Year;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.TimeZone;

public class S13Time {
  static final int BAD_MONTH = 13;

  void zones(String variable) {
    TimeZone.getTimeZone("America/New_York");
    TimeZone.getTimeZone("America/New York");
    TimeZone.getTimeZone("Foo/Bar");
    TimeZone.getTimeZone("GMT+5");
    TimeZone.getTimeZone("GMT-05:30");
    TimeZone.getTimeZone("GMT+24");
    TimeZone.getTimeZone("GMT+1:5");
    TimeZone.getTimeZone("GMT+10:");
    TimeZone.getTimeZone("GMT");
    TimeZone.getTimeZone("UTC");
    TimeZone.getTimeZone("EST");
    TimeZone.getTimeZone("PST");
    TimeZone.getTimeZone("Asia/Calcutta");
    TimeZone.getTimeZone("Asia/Kolkata");
    TimeZone.getTimeZone("est");
    TimeZone.getTimeZone("");
    TimeZone.getTimeZone(variable);
    TimeZone.getTimeZone("US/" + "Pacific");
    TimeZone.getTimeZone("US/Pacific " + "x");
    TimeZone.getTimeZone("Etc/GMT+12");
    TimeZone.getTimeZone("Etc/GMT+13");
    TimeZone.getTimeZone("Etc/GMT+14");
    TimeZone.getTimeZone("America/Los Angeles");
    TimeZone.getTimeZone("Europe/Isle of Man");
    TimeZone.getTimeZone("a b c");
    TimeZone.getTimeZone("é");
  }

  @SuppressWarnings("InvalidTimeZoneID")
  void suppressedZone() {
    TimeZone.getTimeZone("Foo/Bar");
  }

  void zoneIds(String variable) {
    ZoneId.of("America/New_York");
    ZoneId.of("Foo/Bar");
    ZoneId.of("EST");
    ZoneId.of("Z");
    ZoneId.of("z");
    ZoneId.of("+01:00");
    ZoneId.of("+1");
    ZoneId.of("+19:00");
    ZoneId.of("+18:00");
    ZoneId.of("+18:01");
    ZoneId.of("-0130");
    ZoneId.of("+013000");
    ZoneId.of("UTC");
    ZoneId.of("UTC+1");
    ZoneId.of("UTC+25");
    ZoneId.of("UTCx");
    ZoneId.of("GMT0");
    ZoneId.of("GMT-05:00");
    ZoneId.of("UT+01:00");
    ZoneId.of("UT");
    ZoneId.of("UTx");
    ZoneId.of("A");
    ZoneId.of("");
    ZoneId.of("a b");
    ZoneId.of("1ab");
    ZoneId.of("a1");
    ZoneId.of(variable);
    ZoneId.of("Europe/" + "Paris");
    ZoneId.of("America/New York");
    ZoneId.systemDefault();
  }

  @SuppressWarnings("InvalidZoneId")
  void suppressedZoneId() {
    ZoneId.of("Foo/Bar");
  }

  void constants(int variable, long wide) {
    LocalTime.of(24, 0);
    LocalTime.of(23, 60);
    LocalTime.of(1, 2, 60);
    LocalTime.of(1, 2, 3, 1_000_000_000);
    LocalTime.of(1, 2, 3, -1);
    LocalTime.of(0, 0);
    LocalTime.of(23, 59, 59, 999_999_999);
    LocalTime.ofNanoOfDay(86_400_000_000_000L);
    LocalTime.ofNanoOfDay(-1);
    LocalTime.ofSecondOfDay(86400);
    LocalTime.ofSecondOfDay(wide);
    LocalTime.MIDNIGHT.withHour(24);
    LocalTime.MIDNIGHT.withMinute(60);
    Object negativeNano = LocalTime.MIDNIGHT.withNano(-5);
    LocalTime.MIDNIGHT.withSecond(61);
    LocalDate.of(2020, 13, 1);
    LocalDate.of(2020, 0, 1);
    LocalDate.of(2020, 1, 32);
    LocalDate.of(2020, 2, 31);
    LocalDate.of(2020, Month.JANUARY, 32);
    LocalDate.of(1_000_000_000, 1, 1);
    LocalDate.of(-1_000_000_000, 1, 1);
    LocalDate.of(2020, BAD_MONTH, 1);
    LocalDate.of(2020, 6 + 7, 1);
    LocalDate.of(2020, (13), 1);
    LocalDate.of(2020, (int) 13L, 1);
    LocalDate.of(2020, -1, 1);
    LocalDate.of(2020, variable, 40);
    LocalDate.of('a', 1, 1);
    LocalDate.of((short) 2020, (byte) 20, 1);
    LocalDate.ofEpochDay(365_241_780_472L);
    LocalDate.ofEpochDay(Long.MIN_VALUE);
    ofEpochDay(365_241_780_472L);
    LocalDate.ofYearDay(2020, 367);
    LocalDate.ofYearDay(2020, 366);
    LocalDate.MIN.withDayOfMonth(32);
    LocalDate.MIN.withDayOfYear(0);
    LocalDate.MIN.withMonth(13);
    LocalDate.MIN.withYear(Integer.MAX_VALUE);
    LocalDateTime.of(2020, 1, 1, 24, 0);
    LocalDateTime.of(2020, Month.JANUARY, 1, 0, 60);
    LocalDateTime.of(2020, 1, 1, 0, 0, 60);
    LocalDateTime.of(2020, Month.JANUARY, 1, 0, 0, 0, 1_000_000_000);
    LocalDateTime.of(2020, 1, 1, 0, 0, 0, 1_000_000_000);
    LocalDateTime.of(2020, 1, 1, 0, 0, 0);
    LocalDateTime.MIN.withDayOfMonth(0);
    LocalDateTime.MIN.withDayOfYear(367);
    LocalDateTime.MIN.withHour(24);
    LocalDateTime.MIN.withMinute(60);
    LocalDateTime.MIN.withMonth(0);
    LocalDateTime.MIN.withNano(1_000_000_000);
    LocalDateTime.MIN.withSecond(60);
    Object negativeYear = LocalDateTime.MIN.withYear(-1_000_000_000);
    DayOfWeek.of(8);
    DayOfWeek.of(0);
    DayOfWeek.of(7);
    Month.of(13);
    Month.of(12);
    Year.of(1_000_000_000);
    Year.of(Integer.MIN_VALUE);
    Year.of(2020).atDay(367);
    Year.of(2020).atMonth(13);
    YearMonth.of(2020, 13);
    YearMonth.of(2020, Month.JANUARY);
    YearMonth.of(1_000_000_000, 1);
    YearMonth.of(1_000_000_000, Month.MARCH);
    YearMonth.of(2020, 1).atDay(32);
    YearMonth.of(2020, 1).withMonth(13);
    YearMonth.of(2020, 1).withYear(1_000_000_000);
    MonthDay.of(13, 1);
    MonthDay.of(1, 32);
    MonthDay.of(Month.JANUARY, 32);
    MonthDay.of(Month.JANUARY, 31).atYear(1_000_000_000);
    MonthDay.of(1, 1).withDayOfMonth(32);
    MonthDay.of(1, 1).withMonth(13);
  }

  @SuppressWarnings("InvalidJavaTimeConstant")
  void suppressedConstant() {
    LocalTime.of(24, 0);
  }

  static class Local {
    LocalTime of(int hour, int minute) {
      return null;
    }

    void use() {
      of(25, 0);
    }
  }
}
