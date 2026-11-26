package e;

import java.util.function.Function;
import java.util.function.Supplier;

class B7Anonymous {
  private final Function<Integer, Integer> doubler =
      new Function<Integer, Integer>() {
        @Override
        public Integer apply(Integer x) {
          return x * 2;
        }
      };

  private static final Supplier<String> MY_SUPPLIER =
      new Supplier<String>() {
        @Override
        public String get() {
          return "x";
        }
      };

  private final Runnable runner =
      new Runnable() {
        @Override
        public void run() {}
      };

  private final Runnable twoMembers =
      new Runnable() {
        int x;

        @Override
        public void run() {}
      };

  final Runnable notPrivate =
      new Runnable() {
        @Override
        public void run() {}
      };

  private Runnable notFinal =
      new Runnable() {
        @Override
        public void run() {}
      };

  private final Function<Integer, Integer> used =
      new Function<Integer, Integer>() {
        @Override
        public Integer apply(Integer x) {
          return x + 1;
        }
      };

  private final Function<Integer, Integer> escapes =
      new Function<Integer, Integer>() {
        @Override
        public Integer apply(Integer x) {
          return x + 2;
        }
      };

  private final Function<Integer, Integer> chained =
      new Function<Integer, Integer>() {
        @Override
        public Integer apply(Integer x) {
          return x + 3;
        }
      };

  private final Object other =
      new Object() {
        @Override
        public String toString() {
          return "";
        }
      };

  @SuppressWarnings("UnnecessaryAnonymousClass")
  private final Runnable suppressed =
      new Runnable() {
        @Override
        public void run() {}
      };

  int use() {
    runner.run();
    MY_SUPPLIER.get();
    return used.apply(1) + doubler.apply(2);
  }

  Object leak() {
    return escapes;
  }

  Object chain() {
    return chained.andThen(x -> x);
  }

  void run() {
    notPrivate.run();
    notFinal.run();
    twoMembers.run();
    suppressed.run();
  }
}
