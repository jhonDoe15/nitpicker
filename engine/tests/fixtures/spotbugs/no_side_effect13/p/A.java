package p;
import java.lang.reflect.*;
public class A {
  int x;
  void e(Field f) { f.isAccessible(); }
  void g(Field f) { f.getName(); }
  void b(Field f) {
    synchronized (this) {
      x = 1;
      f.isAccessible();
    }
  }
}
