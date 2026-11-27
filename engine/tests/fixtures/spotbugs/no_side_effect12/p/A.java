package p;
import java.lang.reflect.*;
public class A {
  int x;
  void e(Field f) { f.isAccessible(); }
  void g(Field f) { f.getName(); }
  void a(Field f) {
    try {
      f.isAccessible();
      x = 1;
    } catch (Exception e) {
    }
  }
}
