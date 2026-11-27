package p;
public class C1 {
  int x;
  void e(java.lang.reflect.Field f) { f.getName(); }
  void a(java.lang.reflect.Field f) {
    try {
      f.getName();
      x = 1;
    } catch (Exception e) {
    }
  }
}
