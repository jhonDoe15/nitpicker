package lib;

import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

public final class Util {
  public static @Nullable String maybe;

  public static String sure = "";

  public static @Nullable String[] elements = new String[0];

  public static String @Nullable [] array;

  public static List<@Nullable String> list = List.of();

  private Util() {}

  public static boolean hasText(@Nullable String text) {
    return text != null;
  }

  public static void notNull(@Nullable Object value, String message) {}

  public static @Nullable ClassLoader loader() {
    return null;
  }

  @Contract("null -> null; !null -> !null")
  public static @Nullable String same(@Nullable String value) {
    return value;
  }

  @Contract("_, true -> !null")
  public static @Nullable String chosen(@Nullable String value, boolean sure) {
    return value;
  }

  public static void spread(@Nullable String... values) {}

  public static void spreadArray(String @Nullable ... values) {}

  public static void elements(@Nullable String[] values) {}

  public static void array(String @Nullable [] values) {}

  public static void listed(List<@Nullable String> values) {}

  public static Map.@Nullable Entry<String, String> entry() {
    return null;
  }

  public static Outer.@Nullable Inner inner(Outer outer) {
    return null;
  }

  public static @qual.Nullable String checker() {
    return null;
  }

  public static @Nullable String[] elementResult() {
    return new String[0];
  }

  public static String @Nullable [] arrayResult() {
    return null;
  }

  public static <T extends @Nullable Object> T bounded(T value) {
    return value;
  }

  public static class Outer {
    public class Inner {}
  }
}
