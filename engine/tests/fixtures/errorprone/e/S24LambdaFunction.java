package e;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

class S24LambdaFunction {
  private double toDouble(int x, Function<Integer, Double> fn) {
    return fn.apply(x);
  }

  private long toLong(int x, Function<Integer, Long> fn) {
    return fn.apply(x);
  }

  private double doubles(double x, Function<Double, Double> fn) {
    return fn.apply(x);
  }

  private int doubleToInt(double x, final Function<Double, Integer> fn) {
    return fn.apply(x);
  }

  private void unused(String str, Function<Integer, Double> func) {}

  private double sameTwice(double x, Function<Long, Long> fn) {
    return fn.apply(fn.apply(1L)) + this.helper(y -> fn.apply(y));
  }

  private double helper(Function<Long, Long> g) {
    return g.apply(2L);
  }

  public double publicMethod(Function<Integer, Double> fn) {
    return fn.apply(1);
  }

  private double notNumbers(Function<String, String> fn) {
    return 1;
  }

  private double unsupported(Function<Integer, String> fn) {
    return fn.apply(1).length();
  }

  private double suppressedOne(Function<Integer, Double> fn) {
    return fn.apply(1);
  }

  @SuppressWarnings("LambdaFunctionalInterface")
  private double suppressed(Function<Integer, Double> fn) {
    return fn.apply(1);
  }

  static class WithCallSites {
    private static double series(Function<Double, Double> curve) {
      return 2.0 / curve.apply(100.0);
    }

    private static double viaVariable(double curved) {
      Function<Double, Double> curve = x -> Math.pow(x, 1 / curved) * 100;
      return series(curve);
    }

    double viaLambda() {
      return series(mu -> 2.3);
    }
  }

  static class AllLambdaCalls {
    private static double find(Function<Double, Long> cost, double mid) {
      return cost.apply(mid);
    }

    double one() {
      return find(mu -> 0L, 3.0);
    }

    double two() {
      return find(mu -> 2L, 4.0);
    }
  }

  static class AnonymousCall {
    private static double find(Function<Double, Long> cost, double mid) {
      return cost.apply(mid);
    }

    double get() {
      return find(
          new Function<Double, Long>() {
            @Override
            public Long apply(Double mu) {
              return 0L;
            }
          },
          3.0);
    }
  }

  static class TwoFunctions {
    private static double find(Function<Double, Long> first, Function<Integer, Long> second, double mid) {
      first.apply(mid + 2);
      return first.apply(mid);
    }

    double get() {
      return find(mu -> 0L, nu -> 1L, 3.0);
    }
  }

  static class Generic {
    private static <T extends Number> List<T> convert(Function<Double, T> converter) {
      List<T> result = new ArrayList<>();
      T min = converter.apply(2.9);
      result.add(min);
      return result;
    }

    List<Integer> ints() {
      List<Integer> result = convert(num -> 2 + 3);
      return result;
    }

    private <T> int sumAll(Function<T, Integer> size) {
      return size.apply((T) Integer.valueOf(3));
    }

    int total() {
      return sumAll(o -> 2);
    }

    private <U> int other(Function<U, Integer> size) {
      return size.apply((U) new Object());
    }

    private <T> long toLongs(Function<T, Long> size, Function<T, Double> other) {
      other.apply((T) new Object());
      return size.apply((T) new Object());
    }

    private <T extends Number> long bounded(Function<T, String> size) {
      return 1;
    }
  }

  static class Ctors {
    private Ctors(Function<Integer, Integer> fn) {
      fn.apply(1);
    }

    Ctors() {
      this(x -> x + 1);
    }

    private Ctors(String s, Function<Long, Long> fn) {}

    Ctors(String s) {
      this(s, x -> x);
    }

    Ctors(int i) {
      this("a", Long::valueOf);
    }
  }

  static class WithMethodReference {
    private static double series(Function<Double, Double> curve) {
      return curve.apply(1.0);
    }

    double ref() {
      return series(Math::abs);
    }
  }

  interface Api {
    double run(Function<Integer, Double> fn);
  }

  static class Impl implements Api {
    @Override
    public double run(Function<Integer, Double> fn) {
      return 0;
    }
  }

  private static class PrivateNested {
    double run(Function<Integer, Double> fn) {
      return fn.apply(1);
    }
  }

  static void local() {
    class Local {
      double run(Function<Integer, Double> fn) {
        return fn.apply(1);
      }
    }
    Object o = new Object() {
      double run(Function<Long, Double> fn) {
        return fn.apply(1L);
      }
    };
  }

  private double wildcards(Function<? super Integer, ? extends Double> fn, Function<? extends Integer, Long> other) {
    return 0;
  }
}
