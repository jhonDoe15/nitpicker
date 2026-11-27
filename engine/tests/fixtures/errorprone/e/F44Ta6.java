import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.chrono.JapaneseDate;
import java.time.temporal.ChronoField;
import java.time.temporal.TemporalAccessor;

import static java.time.temporal.ChronoField.HOUR_OF_DAY;

public class F44Ta6 {
  void calls(LocalDate date, LocalTime time, Instant instant, JapaneseDate japanese, TemporalAccessor accessor, DayOfWeek day) {
    date.get(ChronoField.HOUR_OF_DAY);
    date.get(HOUR_OF_DAY);
    date.getLong(ChronoField.DAY_OF_MONTH);
    time.get(ChronoField.YEAR);
    instant.get(ChronoField.DAY_OF_MONTH);
    instant.getLong(ChronoField.INSTANT_SECONDS);
    japanese.get(ChronoField.HOUR_OF_DAY);
    japanese.getLong(ChronoField.HOUR_OF_DAY);
    accessor.get(ChronoField.HOUR_OF_DAY);
    day.get(ChronoField.YEAR);
    DayOfWeek.MONDAY.get((ChronoField.YEAR));
  }
}
