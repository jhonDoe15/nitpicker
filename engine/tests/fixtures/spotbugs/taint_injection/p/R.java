package p;
import java.io.*;
import javax.servlet.http.HttpServletRequest;
public class R {
  static class Sub extends File { Sub(String p) { super(p); } }
  class Inner extends File { Inner(String p) { super(p); } }
  static void two(Object a, Object b) {}
  void a(String p) throws Exception {
    for (int i = 0; i < 2; i++) {
      System.out.println("x");
      try (FileReader r = new FileReader(
          new File(p))) { r.read(); }
    }
  }
  void b(String p) {
    do {
      System.out.println("y");
    } while (new File(p).exists());
  }
  void c(String p, HttpServletRequest q) { two(new File(p), new File(q.getParameter("a"))); }
  void d(String p, String s) { two(new File(p), new File(s)); }
  void e(String p) { new Inner(p); }
  void f(HttpServletRequest q) { new Sub(q.getParameter("a")) { }; d("a", "b"); }
  void g(HttpServletRequest q) { new Anon(q.getParameter("a")) { }; }
  static class Anon { Anon(String p) { new File(p); } }
}
