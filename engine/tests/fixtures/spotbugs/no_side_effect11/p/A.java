package p;
import java.lang.reflect.*;
import java.util.*;
public class A {
  int x;
  void a(Field f) {
    try {
      f.isAccessible();
      x = 1;
    } catch (Exception e) {
    }
  }
  void b(Field f) {
    synchronized (this) {
      x = 1;
      f.isAccessible();
    }
  }
  void e(Field f) { f.isAccessible(); }
  void g(Field f) { try { f.isAccessible(); } catch (Exception e) {} }
  void h(ArrayList<String> l) {
    try {
      l.size();
      x = 1;
    } catch (Exception e) {
    }
  }
  void i(ArrayList<String> l) { l.size(); }
}
