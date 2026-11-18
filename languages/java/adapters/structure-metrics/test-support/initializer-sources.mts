export const INITIALIZERS = `package demo;

import java.util.List;
import java.util.function.Function;
import java.util.function.Supplier;

public class Initializers {
  static final Function<Integer, Integer> DOUBLE = x -> x > 0 ? x * 2 : 0;
  static final int FLAG = System.getenv("X") != null && System.getenv("Y") != null ? 1 : 2;
  static final int PLAIN = 3;
  private final Supplier<String> supplier = () -> {
    if (FLAG > 1) {
      return "a";
    }
    return "b";
  };
  static List<String> names;

  static {
    if (FLAG > 1) {
      names = List.of("a");
    }
    Runnable r = () -> System.out.println("hi");
    r.run();
  }

  static {
  }

  {
    names = null;
  }

  void run(List<Integer> list) {
    list.forEach(i -> {
      if (i > 0) {
        list.stream().map(j -> j > 1 ? j : -j).forEach(System.out::println);
      }
    });
    Function<Integer, Integer> local = (Integer v) -> v + 1;
    Runnable anonymous = new Runnable() {
      public void run() {
        Runnable inner = () -> {};
      }
    };
    if (list.isEmpty() || list.size() > 3) {
      System.out.println(local.apply(1));
    }
  }

  enum Code {
    A(x -> x),
    B(x -> x + 1) {
      int value() {
        return 2;
      }
    };

    Code(Function<Integer, Integer> function) {}

    int value() {
      return 1;
    }
  }
}
`;
