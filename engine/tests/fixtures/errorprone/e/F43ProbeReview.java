import com.google.common.flogger.FluentLogger;
import com.google.common.flogger.LazyArg;
import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;
import java.util.Date;
import java.util.List;

class F43ProbeReview {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  interface IntLazy extends LazyArg<Integer> {}

  interface GenLazy<T> extends LazyArg<T> {}

  @FormatMethod
  static void log(String format, Object... args) {}

  @FormatMethod
  F43ProbeReview(String format, Object... args) {}

  F43ProbeReview() {
    this("%s %s", 1);
  }

  F43ProbeReview(int code) {
    this(String.valueOf(code), 1);
  }

  enum Level {
    LOW("%d", "x"),
    HIGH("%s");

    @FormatMethod
    Level(String format, Object... args) {}
  }

  static String foo() {
    return "%s";
  }

  void annotation(String p) {
    var k = foo();
    log(k, 1);
    var c = "%s";
    log(c, 1);
  }

  void flogger(IntLazy il, GenLazy<Long> gl, GenLazy<? extends Date> gd, List<? extends Integer> li) {
    logger.atInfo().log("%f", il);
    logger.atInfo().log("%f", gl);
    logger.atInfo().log("%d", gd);
    logger.atInfo().log("%s", 1, null);
    logger.atInfo().log("%s", 1, (Exception) null);
    String.format("%f", li.get(0));
  }

  <T extends Date> void bound(T t, List<T> ts) {
    String.format("%d", t);
    String.format("%d", ts.get(0));
  }

  void orphaned(StringBuilder sb) {
    System.out.println("%s" + "%d");
    System.out.println("a" + "%s" + "b");
    System.out.println(("%s" + "x") + 1);
    sb.append("%s" + "%s", 0, 1);
  }

  static class Child extends F43ProbeReview {
    Child() {
      super("%s");
    }
  }

  static class Failure extends RuntimeException {
    Failure() {
      super("%s failed");
    }
  }
}
