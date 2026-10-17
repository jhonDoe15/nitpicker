package guards;

public final class Modern {
  private Modern() {}

  public enum Level {
    LOW,
    HIGH
  }

  public sealed interface Outcome permits Done, Failed {}

  public record Done(String value) implements Outcome {}

  public record Failed(String reason) implements Outcome {}

  public @interface Client {}

  public interface Handler { // violation: pmd/ImplicitFunctionalInterface
    void handle(String value);
  }

  @FunctionalInterface
  public interface Listener {
    void heard(String value);
  }

  @Client
  public interface Remote {
    String fetch();
  }

  public interface Pair {
    int first();

    int second();
  }

  public static int weight(Level level) {
    return switch (level) { // violation: pmd/ExhaustiveSwitchHasDefault
      case LOW -> 1;
      case HIGH -> 2;
      default -> 0;
    };
  }

  public static int exactWeight(Level level) {
    return switch (level) {
      case LOW -> 1;
      case HIGH -> 2;
    };
  }

  public static String describe(Outcome outcome) {
    return switch (outcome) { // violation: pmd/ExhaustiveSwitchHasDefault
      case Done done -> done.value();
      case Failed failed -> failed.reason();
      default -> "none";
    };
  }

  public static String exactDescribe(Outcome outcome) {
    return switch (outcome) {
      case Done done -> done.value();
      case Failed failed -> failed.reason();
    };
  }

  public static int classic(Level level) {
    switch (level) {
      case LOW:
        return 1;
      case HIGH:
        return 2;
      default:
        throw new IllegalStateException("Unknown level " + level);
    }
  }

  @SuppressWarnings("PMD.SpringDataNativeQuery") // violation: pmd/UnnecessaryWarningSuppression
  public static String query() {
    return "select 1";
  }
}
