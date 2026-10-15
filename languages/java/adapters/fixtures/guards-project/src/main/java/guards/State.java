package guards;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class State {
  private static int counter; // violation: pmd/NonFinalStaticField
  private static final List<String> SEEN = new ArrayList<>(); // violation: pmd/MutableStaticCollection
  private static final List<String> KNOWN = List.of("a");
  private static final Map<String, String> CACHE = new ConcurrentHashMap<>();
  private static final int maxSize = 5; // violation: checkstyle/com.puppycrawl.tools.checkstyle.checks.naming.ConstantNameCheck
  private static final int LIMIT = 3;
  private static final State shared = new State();
  public String label; // violation: checkstyle/com.puppycrawl.tools.checkstyle.checks.design.VisibilityModifierCheck
  public final String name = "state";

  public int next(String key) {
    counter += LIMIT;
    SEEN.add(key);
    CACHE.putIfAbsent(key, key);
    return counter * 7 + maxSize + KNOWN.size(); // violation: checkstyle/com.puppycrawl.tools.checkstyle.checks.coding.MagicNumberCheck
  }

  public State instance() {
    return shared;
  }
}
