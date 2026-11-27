import javax.annotation.Nullable;

class S39NullableVoid1 {
  // BUG: Diagnostic contains:
  @Nullable
  void f() {}
}
