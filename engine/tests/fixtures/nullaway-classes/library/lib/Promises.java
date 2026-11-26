package lib;

import java.util.List;
import org.jspecify.annotations.Nullable;

public final class Promises {
  public static final boolean SURE = true;

  @Contract("_ -> !null")
  public static @Nullable String spread(String... values) { return ""; }

  @Contract("_, _ -> !null")
  public static @Nullable String after(String first, String... rest) { return ""; }

  @Contract("_, true -> !null")
  public static @Nullable String chosen(@Nullable String value, boolean sure) { return value; }

  @Contract("true -> !null")
  public static @Nullable String checked(boolean present) { return null; }

  @Contract(pure = true, value = "!null -> !null")
  public static @Nullable String pure(@Nullable String value) { return value; }

  public static void rows(String @Nullable []... rows) {}

  public interface Grid {
    void run(@Nullable String @Nullable [] cells, String @Nullable [] rest, @Nullable String last);
  }

  public interface Listed<T> {
    void run(@Nullable T one, List<@Nullable T> all);
  }
}
