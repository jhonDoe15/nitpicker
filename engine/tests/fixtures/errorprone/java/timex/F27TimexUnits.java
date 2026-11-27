package java.timex;
import java.time.*;
import java.time.temporal.ChronoUnit;
class F27TimexUnits {
    Object m(Duration d, Instant i, LocalDate ld) {
        Duration.of(1, ChronoUnit.YEARS);
        d.plus(1, ChronoUnit.YEARS);
        i.plus(1, ChronoUnit.YEARS);
        i.plus(1, ChronoUnit.MONTHS);
        Instant.EPOCH.minus(1, ChronoUnit.YEARS);
        ld.plus(Duration.ZERO);
        ZoneId.of("Z");
        return Duration.of(1, ChronoUnit.DECADES);
    }
}
