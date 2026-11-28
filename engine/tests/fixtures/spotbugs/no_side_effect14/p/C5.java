package p;
public class C5 {
  int x;
  void e(java.lang.reflect.Field f) { f.isAccessible(); }
  void a(java.lang.reflect.Field f) {
    try { f.isAccessible(); } catch (Exception e) {}
  }
}
