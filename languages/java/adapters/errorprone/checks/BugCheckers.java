import com.google.errorprone.BugCheckerInfo;
import com.google.errorprone.scanner.BuiltInCheckerSuppliers;
import java.util.HashSet;
import java.util.Set;

/**
 * Prints every check of the Error Prone jar on the classpath, one per line: its name, its default
 * severity, {@code on} or {@code off} by default, and all its names joined with commas, tab-separated.
 * checks-catalog.e2e.test.mjs compares checks.json with it.
 */
public final class BugCheckers {

  private BugCheckers() {}

  public static void main(String[] arguments) {
    Set<String> onByDefault = new HashSet<>();
    BuiltInCheckerSuppliers.ENABLED_ERRORS.forEach(check -> onByDefault.add(check.canonicalName()));
    BuiltInCheckerSuppliers.ENABLED_WARNINGS.forEach(check -> onByDefault.add(check.canonicalName()));
    for (BugCheckerInfo check : BuiltInCheckerSuppliers.allChecks().getAllChecks().values()) {
      System.out.println(
          String.join(
              "\t",
              check.canonicalName(),
              check.defaultSeverity().name(),
              onByDefault.contains(check.canonicalName()) ? "on" : "off",
              String.join(",", check.allNames())));
    }
  }
}
