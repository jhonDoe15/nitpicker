import java.time.*;

class F43Fs7 {
  void f() {
    System.err.printf("%tY", LocalDateTime.ofInstant(Instant.now(), ZoneId.systemDefault()));
    System.err.printf("%tQ", Instant.now());
    System.err.printf(
        "%tZ",
        ZonedDateTime.of(
            LocalDate.of(2018, 12, 27), LocalTime.of(17, 0), ZoneId.of("Europe/London")));
  }
}
