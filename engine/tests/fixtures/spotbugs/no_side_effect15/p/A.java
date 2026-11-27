package p;
public class A {
  public static class H1 { public int two() { return 2; } }
  public static class H2 { public boolean equals(Object o) { return false; } public int hashCode() { return 1; } public int two() { return 2; } }
  public static class H3 { public int hashCode() { return 1; } public int two() { return 2; } }
  public static class H4 { public String toString() { return "x"; } public int two() { return 2; } }
  public static class H5 { public boolean two() { return false; } }
  void a(H1 h) { h.two(); }
  void b(H2 h) { h.two(); }
  void c(H3 h) { h.two(); }
  void d(H4 h) { h.two(); }
  void e(H5 h) { h.two(); }
}
