import javax.annotation.CheckForNull;

class S39NullableVoid3 {
  // BUG: Diagnostic contains:
  @CheckForNull
  void f() {}
}
