package p;
public class C6 {
  int x;
  void e(java.lang.reflect.Field f) { f.getModifiers(); }
  void a(java.lang.reflect.Field f) {
    try {
      f.getModifiers();
      x = 1;
    } catch (Exception e) {
    }
  }
}
