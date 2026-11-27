package p;
public class C2 {
  int x;
  void e(java.lang.reflect.Field f) { f.getName(); }
  void a(java.lang.reflect.Field f) {
    synchronized (this) {
      x = 1;
      f.getName();
    }
  }
}
