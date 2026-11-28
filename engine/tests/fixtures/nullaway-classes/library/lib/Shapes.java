package lib;

import java.util.List;
import org.jspecify.annotations.Nullable;

public interface Shapes {
  String named(@Nullable Object key);

  <T> void typed(@Nullable T value, List<? super @Nullable T> sink);

  void matrix(String @Nullable [][] rows, @Nullable String @Nullable [] both);

  interface Taker<T> {
    void take(@Nullable T value, @Nullable String note);
  }

  class Holder {
    public Holder(@Nullable String first, String second) {}

    public class Part {
      public Part(@Nullable String first, String second) {}
    }

    public class Pair<T> {
      public Pair(T first, @Nullable String second, String third) {}
    }
  }
}
