package p;
import java.io.*;
import javax.servlet.http.HttpServletRequest;
public class S {
  static void two(Object a, Object b) {}
  void d(String p, String s) { two(new File(p), new File(s)); }
  void e(String p, String s) { two(new File(p), new File(s)); }
  void f(String p, String s) { two(new File(p), new File(s)); }
  void call(HttpServletRequest q) { d(q.getParameter("a"), q.getParameter("b")); e(q.getParameter("a"), "x"); f("x", "y"); }
  record Rec(String path) { Rec { new File(path); } }
  record Rec2(String path) { Rec2 { new File(path); } }
  void g(HttpServletRequest q) { new Rec(q.getParameter("a")); new Rec2("a"); }
}
