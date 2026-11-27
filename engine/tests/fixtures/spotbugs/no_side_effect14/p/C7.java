package p;
public class C7 {
  int x;
  void e(Object f) { f.hashCode(); }
  void a(Object f) {
    try {
      f.hashCode();
      x = 1;
    } catch (Exception e) {
    }
  }
}
