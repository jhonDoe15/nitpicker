package u;

import java.util.List;
import lib.Shapes;
import org.jspecify.annotations.Nullable;

public class Shaped implements Shapes {
  @Override
  public @Nullable String named(Object key) {
    return null;
  }

  @Override
  public <T> void typed(T value, List<? super T> sink) {}

  @Override
  public void matrix(String[][] rows, String[] both) {}

  static void need(String value, String note) {}

  static void parts(Shapes.Holder holder) {
    new Shapes.Holder(null, null);
    Shapes.Taker<String> taker = Shaped::need;
    Shapes.Taker<String> lambda = (value, note) -> {};
    Shapes.Taker<String> typed = (String value, String note) -> {};
    holder.new Part(null, null);
    holder.new Part("a", "b");
    holder.new Pair<String>(null, null, null);
  }

  static class Owner extends Shapes.Holder {
    Owner() {
      super(null, "");
    }

    Object part() {
      return new Part(null, null);
    }

    Object pair() {
      return new Pair<>("a", null, null);
    }
  }
}
