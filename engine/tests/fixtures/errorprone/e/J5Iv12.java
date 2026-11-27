import com.google.errorprone.annotations.InlineMe;

public final class J5Iv12 {
  @InlineMe(replacement = "x == y ? this.a() : this.b()")
  // BUG: Diagnostic contains: complex statement
  public boolean before(int x, int y) {
    return x == y ? a() : b();
  }

  public boolean a() {
    return true;
  }

  public boolean b() {
    return false;
  }
}

