import com.google.errorprone.annotations.FormatMethod;
import java.io.PrintStream;

class F43ProbeOrphaned {
  @FormatMethod
  void report(String format, Object... args) {}

  void report(int code, String message) {}

  static class Child extends F43ProbeOrphaned {
    void use() {
      report(1, "missing %s");
      this.report(2, "missing %d");
    }
  }

  static class Problem extends Exception {
    Problem(String message) {}

    Problem(String format, Object... args) {}
  }

  void calls(PrintStream out, StringBuilder builder) throws Exception {
    out.println("value %s");
    out.print(("value %s"));
    out.println("100%");
    out.println("%n only");
    out.println("%s".length());
    new StringBuilder("x %d");
    builder.append("a %s", 0, 3);
    builder.append("a %s");
    new IllegalStateException("bad %s");
    new IllegalStateException("bad %s", null);
    new Problem("bad %s");
    new Problem("bad %s", 1);
    report("fine %s");
    report(3, "not fine %s");
    out.println("""
        block %s
        """);
    out.println("%1$s");
    out.println("%<s");
    out.println("%-s");
    throw new Exception("bad %d");
  }
}
