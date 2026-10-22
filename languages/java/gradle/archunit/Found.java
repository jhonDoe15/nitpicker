import com.tngtech.archunit.core.domain.JavaClass;
import java.util.Comparator;
import java.util.Set;
import java.util.TreeSet;

final class Found {
  private static final Comparator<Found> ORDER =
      Comparator.comparing((Found found) -> found.rule)
          .thenComparing(found -> found.className)
          .thenComparing(found -> found.detail);

  final String rule;
  final String className;
  final String fileName;
  final String detail;

  private Found(String rule, String className, String fileName, String detail) {
    this.rule = rule;
    this.className = className;
    this.fileName = fileName;
    this.detail = detail;
  }

  static Set<Found> newSet() {
    return new TreeSet<>(ORDER);
  }

  static void add(Set<Found> sink, String rule, JavaClass origin, String detail) {
    JavaClass owner = Spring.owner(origin);
    sink.add(new Found(rule, owner.getName(), Spring.sourceFile(owner), detail));
  }

  static void dropShadowed(Set<Found> sink, String rule, Set<String> preferred) {
    sink.removeIf(
        found -> found.rule.equals(rule)
            && sink.stream()
                .anyMatch(
                    other -> preferred.contains(other.rule)
                        && other.className.equals(found.className)
                        && other.detail.equals(found.detail)));
  }

  String toJson() {
    return "{\"rule\":" + quote(rule) + ",\"className\":" + quote(className) + ",\"fileName\":"
        + quote(fileName) + ",\"detail\":" + quote(detail) + "}";
  }

  private static String quote(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : text.toCharArray()) {
      if (c == '"' || c == '\\') {
        out.append('\\').append(c);
      } else if (c < 0x20) {
        out.append(String.format("\\u%04x", (int) c));
      } else {
        out.append(c);
      }
    }
    return out.append('"').toString();
  }
}
