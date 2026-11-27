import com.google.errorprone.annotations.FormatMethod;

class F43Fa15 {
  @FormatMethod
  void f(Throwable o, String fmt, Object... args) {}

  void test(Throwable t) {
    f(t.getCause(), "message: %s", t.getMessage());
  }
}
