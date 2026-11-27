import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Month;
import java.time.MonthDay;
import java.time.OffsetDateTime;
import java.time.OffsetTime;
import java.time.Year;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.chrono.HijrahDate;
import java.time.chrono.HijrahEra;
import java.time.chrono.IsoEra;
import java.time.chrono.JapaneseDate;
import java.time.chrono.JapaneseEra;
import java.time.chrono.MinguoDate;
import java.time.chrono.MinguoEra;
import java.time.chrono.ThaiBuddhistDate;
import java.time.chrono.ThaiBuddhistEra;
import java.time.temporal.ChronoField;
import java.time.temporal.TemporalAccessor;
import java.util.List;

/** Prints, for each java.time type, the ChronoField constants it does not support: the table in temporal_fields.rs. */
public class TemporalFieldsProbe {
  public static void main(String[] arguments) {
    ZoneId zone = ZoneId.of("America/Los_Angeles");
    List<TemporalAccessor> instances = List.of(DayOfWeek.MONDAY, HijrahDate.now(zone), HijrahEra.AH, Instant.now(),
        IsoEra.CE, JapaneseDate.now(zone), JapaneseEra.SHOWA, LocalDate.now(zone), LocalDateTime.now(zone),
        LocalTime.now(zone), MinguoDate.now(zone), MinguoEra.ROC, Month.MAY, MonthDay.now(zone),
        OffsetDateTime.now(zone), OffsetTime.now(zone), ThaiBuddhistDate.now(zone), ThaiBuddhistEra.BE,
        Year.now(zone), YearMonth.now(zone), ZonedDateTime.now(zone), ZoneOffset.ofHours(8));
    for (TemporalAccessor instance : instances) {
      StringBuilder line = new StringBuilder(instance.getClass().getCanonicalName()).append('\t');
      for (ChronoField field : ChronoField.values()) {
        if (!instance.isSupported(field)) {
          line.append(field.name()).append(' ');
        }
      }
      System.out.println(line.toString().trim());
    }
  }
}
