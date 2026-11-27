package p;
import java.io.File;
import javax.servlet.http.*;
public class D {
  static String a = "c";
  static String b = "c";
  static String c;
  static String d;
  static String e;
  static final String F = "f";
  static String g;
  public void put(HttpServletRequest r) { b = r.getParameter("x"); d = "y"; e = q.L.k(); }
  public void g1() { String x = "y"; new File("x" + x); }
  public void g2() { new File("x" + F); }
  public void g3() { String x = null; new File("x" + x); }
  public void g4() { new File(a); }
  public void g5() { new File(b); }
  public void g6() { new File(E.h); }
  public void g7() { new File(d); }
  public void g8() { new File(e); }
  public void g9() { new File(E.k); }
  public void g10() { new File(E.m); }
  public void g11() { new File(g); }
  public void g12() { new File(E.n); }
  public void g13() { new File(E.o); }
}
class E {
  static String h;
  static String k = "k";
  static String m = "k";
  static String n;
  static String o;
  static void put(HttpServletRequest r) { h = r.getParameter("x"); m = "z"; D.g = "w"; n = "z"; o = String.valueOf(1); }
}
