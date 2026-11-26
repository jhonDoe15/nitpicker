import com.google.inject.assistedinject.AssistedInject;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.util.List;
import java.util.function.Function;
import javax.annotation.processing.Generated;

class S16Decls {
  static class TwoCtors {
    @javax.inject.Inject
    TwoCtors() {}

    @AssistedInject
    TwoCtors(int x) {}
  }

  static class OneCtor {
    @AssistedInject
    OneCtor() {}

    OneCtor(int x) {}
  }

  static class GuiceMix {
    @com.google.inject.Inject
    GuiceMix() {}

    @AssistedInject
    GuiceMix(String s) {}

    GuiceMix(int s) {}
  }

  @SuppressWarnings("AssistedInjectAndInjectOnConstructors")
  static class TwoCtorsSuppressed {
    @javax.inject.Inject
    TwoCtorsSuppressed() {}

    @AssistedInject
    TwoCtorsSuppressed(int x) {}
  }

  enum E {
    A(1),
    B;

    @javax.inject.Inject
    E() {}

    @AssistedInject
    E(int x) {}
  }

  record R(int a) {
    @javax.inject.Inject
    R {}

    @AssistedInject
    R(String s) {
      this(1);
    }
  }

  static class Same {
    @javax.inject.Inject
    @AssistedInject
    Same() {}

    @AssistedInject
    @com.google.inject.Inject
    Same(int x) {}

    @SuppressWarnings("AssistedInjectAndInjectOnSameConstructor")
    @AssistedInject
    @javax.inject.Inject
    Same(String x) {}

    @AssistedInject
    Same(long x) {}

    @javax.inject.Inject
    void notCtor() {}
  }

  void streams(OutputStreamWriter os, List<String> list) throws Exception {
    try (PrintWriter pw = new PrintWriter(new OutputStreamWriter(System.err), true)) {
      pw.println("hello");
    }
    try (PrintWriter pw = new PrintWriter(System.out)) {
      pw.println("hello");
    }
    try (System.out) {
    }
    try (java.io.PrintStream ps = java.lang.System.err;
        PrintWriter pw = new PrintWriter(os, true)) {
      pw.println("hello");
    }
    System.err.println(42);
    try (PrintWriter pw = new PrintWriter(os, true)) {
      System.out.println("hello");
      pw.println("hello");
    }
    try (PrintWriter pw = new PrintWriter(os, true)) {
      Runnable r = () -> System.out.println(1);
    }
    try (PrintWriter pw =
        ((java.util.function.Supplier<PrintWriter>)
                () -> {
                  try (PrintWriter inner = new PrintWriter(System.out)) {
                    return inner;
                  }
                })
            .get()) {
    }
    try (PrintWriter pw = new PrintWriter(os, true)) {
    } finally {
      System.out.println("done");
    }
  }

  @SuppressWarnings("ClosingStandardOutputStreams")
  void streamsSuppressed() {
    try (PrintWriter pw = new PrintWriter(System.out)) {
      pw.println("hello");
    }
  }

  void deprecated(@Deprecated int param, int plain, @java.lang.Deprecated String other) {
    @Deprecated int local = 1;
    @Deprecated int a = 1, b = 2;
    @Deprecated
    final int c = 3;
    @SuppressWarnings("DeprecatedVariable")
    @Deprecated int d = 4;
    for (@Deprecated String s : List.of("a")) {}
    for (@Deprecated int i = 0; i < 1; i++) {}
    Function<Integer, Integer> f = (@Deprecated Integer boxed) -> boxed;
    try {
    } catch (@Deprecated RuntimeException e) {
    }
    try (@Deprecated java.io.StringReader reader = new java.io.StringReader("")) {
    }
    @SuppressWarnings({"unused", "DeprecatedVariable"})
    int e = 1;
    Object o = "x";
    if (o instanceof @Deprecated String str) {}
  }

  void varargs(@Deprecated String... rest) {}

  @Deprecated int field = 1;

  @Deprecated
  void method() {}

  record P(@Deprecated int x) {}

  record Q(@Deprecated int x) {
    Q(@Deprecated int x) {
      this.x = x;
    }
  }

  record Compact(@Deprecated int x) {
    Compact {}
  }
}

;
