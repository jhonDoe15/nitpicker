package p;
import java.io.*;
import javax.servlet.http.*;
public class V4 {
  public void h1(String p) { new File(p); }
  public void a1(HttpServletRequest r) { h1(r.getParameter("a")); }
  public void a2() { h1("a"); }
  public void h2(String p) { new File(p); }
  public void b1(HttpServletRequest r) { h2(r.getParameter("a")); }
  public void b2(String s) { h2(s); }
  public void h3(String p) { new File(p); }
  public void d1() { Runnable x = () -> h3("a"); }
  public void h4(String p) { new File(p); }
  public void e1() { java.util.function.Consumer<String> c = this::h4; }
  public void h5(String p) { new File(p); h5("a"); }
  public void h6(String p) { if (p.isEmpty()) h6("a"); new File(p); }
  public void h7(String p) { new File(p); }
  public void f1() { new Object() { void x() { h7("a"); } }; }
  public void h8(String p, int n) { new File(p); }
  public void g1(String s) { h8(s, 1); }
  public void g2(HttpServletRequest r) { h8(r.getParameter("a"), 2); }
  public void h9(String p) { new File(p); }
  public void k1(String s) { h9(s.trim()); }
  public void h10(String p) { new File(p); }
  public void k2(String s) { k3(s); }
  public void k3(String s) { h10(s); }
}
