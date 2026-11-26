package e;

import static com.google.common.util.concurrent.Futures.immediateFuture;

import com.google.common.base.Optional;
import com.google.common.base.Strings;
import com.google.common.util.concurrent.AsyncCallable;
import com.google.common.util.concurrent.AsyncFunction;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.function.Supplier;

class S9AsyncFunction {
  static void listenableFutures() {
    new AsyncFunction<String, Object>() {
      @Override
      public ListenableFuture<Object> apply(String input) throws Exception {
        return null;
      }
    };

    new AsyncFunction<Object, String>() {
      @Override
      public ListenableFuture<String> apply(Object o) {
        if (o instanceof String) {
          return immediateFuture((String) o);
        }
        return null;
      }
    };

    new AsyncFunction<String, Object>() {
      @Override
      public ListenableFuture<Object> apply(String input) throws Exception {
        return immediateFuture(null);
      }
    };

    new S9Plain<String, Object>() {
      @Override
      public ListenableFuture<Object> apply(String input) throws Exception {
        return null;
      }
    };

    new AsyncFunction<String, Object>() {
      @Override
      public ListenableFuture<Object> apply(String input) throws Exception {
        Supplier<String> s =
            () -> {
              return null;
            };
        return immediateFuture(s.get());
      }
    };

    new AsyncFunction<String, Object>() {
      @Override
      public ListenableFuture<Object> apply(String input) throws Exception {
        return apply(input, input);
      }

      public ListenableFuture<Object> apply(String input1, String input2) {
        return null;
      }
    };
  }

  static class Mine implements AsyncFunction<Object, String> {
    @Override
    public ListenableFuture<String> apply(Object input) throws Exception {
      return input == null ? null : immediateFuture("x");
    }
  }

  static class Parens implements AsyncFunction<Object, String> {
    @Override
    public ListenableFuture<String> apply(Object input) throws Exception {
      return (ListenableFuture<String>) null;
    }
  }

  static AsyncFunction<String, String> lambdas() {
    AsyncFunction<String, String> a = x -> null;
    AsyncFunction<String, String> b = x -> immediateFuture(null);
    AsyncFunction<String, String> c = x -> x == null ? null : immediateFuture(x);
    AsyncFunction<String, String> d = x -> {
      return null;
    };
    AsyncFunction<String, String> f = x -> (null);
    return a;
  }

  @SuppressWarnings("AsyncFunctionReturnsNull")
  static AsyncFunction<String, String> suppressed() {
    return x -> null;
  }

  interface S9Plain<I, O> {
    ListenableFuture<O> apply(I input) throws Exception;
  }
}

class S9AsyncCallable {
  static void run() {
    AsyncCallable<String> a = () -> null;
    AsyncCallable<String> b = () -> immediateFuture(null);
    AsyncCallable<String> c = () -> {
      return null;
    };
    new AsyncCallable<String>() {
      @Override
      public ListenableFuture<String> call() {
        return null;
      }
    };
    AsyncFunction<String, String> d = x -> null;
  }

  static ListenableFuture<String> plain() {
    return null;
  }

  static Object nested() {
    return (AsyncCallable<String>) () -> {
      Runnable r = () -> {};
      return null;
    };
  }
}

class S9Deref {
  void positive(java.util.Optional<Integer> o, Optional<String> g, String s) {
    o.orElse(null).intValue();
    g.orNull().length();
    Strings.emptyToNull(s).length();
    ((String) null).length();
    ((Integer) o.orElse(null)).intValue();
    (s == null ? null : s).length();
    (s != null ? s : null).length();
    Void v = null;
    v.toString();
    Object w = (s == null) ? s.length() : 0;
    int n = (s == null) ? s.length() : 0;
    int m = (s == null && n > 1) ? s.length() : 0;
    int k = (null == s) ? s.length() : 0;
    int j = (s != null) ? 0 : s.length();
    int i = s == null ? (s.length()) : 0;
    int h = s == null ? 1 + s.length() : 0;
    int g2 = s == null ? 0 : s.length();
    String q = s == null ? s : "x";
    q.length();
    (s == null ? s : "x").length();
    (s != null ? "x" : s).length();
  }

  void negative(java.util.Optional<Integer> o, Class<?> c) {
    java.util.Optional.of(7).get().intValue();
    c = Void.class;
    c = void.class;
    c = Void.TYPE;
    o.orElse(5).intValue();
    String.class.getName();
    java.util.Map.Entry.class.getName();
  }

  Object sw(int k, String s) {
    return (switch (k) {
      case 1 -> null;
      default -> "x";
    }).toString();
  }

  @SuppressWarnings("DereferenceWithNullBranch")
  void suppressed(java.util.Optional<Integer> o) {
    o.orElse(null).intValue();
  }

  class Bar {}

  S9Deref.Bar bar;

  void qualified(java.util.Map.Entry<?, ?> entry) {
    String t = this.bar.toString();
    java.lang.String.valueOf(1);
  }
}

class S9Literal {
  void run(java.util.Optional<String> o) {
    String a = o.orElseGet(null);
    String b = o.orElseThrow(null);
    String c = o.orElse(null);
    String d = o.orElseGet(() -> null);
    Object e = java.util.Optional.of("x").orElseGet(null);
    String f = other().orElseGet(null);
    String g = (o).orElseGet(null);
    String h = o.orElseGet((java.util.function.Supplier<String>) null);
    String i = o.map(x -> x).orElseThrow(null);
    java.util.Optional<String> p = null;
    String k = p.orElseGet(null);
  }

  java.util.Optional<String> other() {
    return java.util.Optional.empty();
  }

  String chained(java.util.Optional<String> o) {
    return o.filter(x -> x.isEmpty()).orElseGet(null);
  }

  @SuppressWarnings("DangerousLiteralNull")
  String suppressed(java.util.Optional<String> o) {
    return o.orElseGet(null);
  }
}
