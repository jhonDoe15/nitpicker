package e;

import java.util.List;
import java.util.Map;

public class Signatures {
  @interface Inject {}

  private static class Hidden extends Exception {}

  private interface Secret {}

  private static class Deep {
    static class Inner {}

    Hidden reach;
  }

  static class Open {}

  Hidden field;
  Map<String, List<Hidden>> wrapped, twice;
  Deep.Inner qualified;
  Signatures.Hidden[] spelled;
  private Hidden kept;
  @Inject Hidden injected;
  Open fine;

  Signatures(Hidden first) {}

  Hidden returns() {
    return null;
  }

  void takes(int count, Open open, Hidden... rest) {}

  void fails() throws Hidden {}

  <T extends Hidden & Secret> void bounded(T value, Secret other) {}

  private void quiet(Hidden hidden) {}

  @Inject
  void wired(Hidden hidden) {}

  static class Child extends Hidden implements Secret {}

  interface Wide extends Secret {}

  static class Generic<T extends Deep.Inner> {
    T value;
  }

  record Pair(Hidden left, Open right) {
    Pair {}
  }

  record Plain(Secret only) {}

  enum Choice implements Secret {
    ONLY
  }

  void local() {
    class Local {
      Hidden inside;
    }
    Object anonymous =
        new Object() {
          Hidden inside;
        };
  }
}
