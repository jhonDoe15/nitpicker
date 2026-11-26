package e;

import java.util.function.Function;
import java.util.function.Supplier;

class S25SameNameReferences {
  static class Pos {
    static class Item {
      static Item make() {
        return new Item();
      }

      static String show(Object value) {
        return "";
      }
    }
  }

  static class Neg {
    static class Item {
      static String show(Object value) {
        return "";
      }
    }

    Supplier<Pos.Item> made = Pos.Item::new;
    Supplier<Item> plain = Item::new;
    Function<Object, String> shown = Item::show;
    Supplier<Pos.Item> maker = Pos.Item::make;
  }

  static class Uses {
    Supplier<Object> first = Pos.Item::new;
    Supplier<Object> second = Neg.Item::new;
  }
}
