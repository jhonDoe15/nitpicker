import java.time.Instant;

class F44At1 {
  void f() {
    // BUG: Diagnostic contains: will fail at runtime with a DateTimeParseException
    Instant.parse("2007-12-3T10:15:30.00Z");
  }
}
