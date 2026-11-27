package p;
import java.io.File;
import java.sql.*;
import javax.servlet.http.*;
public class C {
  private static String s1 = "k";
  private static String s2;
  private static String s3;
  private static final String S4;
  static { S4 = "k"; }
  private static String s5;
  public void f1() { new File(s1); }
  public void f2() { new File(s2); }
  public void put2() { s2 = "c"; }
  public void put3(HttpServletRequest r) { s3 = r.getParameter("a"); }
  public void f3() { new File(s3); }
  public void f4() { new File(S4); }
  public void f5() { new File(s5); }
  public void put5(HttpServletRequest r) { s5 = r.getParameter("a"); }
  public void f6(HttpServletRequest r) { new File(r.getParameter("a") + r.getParameter("b")); }
  public void f7(HttpServletRequest r) { new File((r.getParameter("a") + "x").trim()); }
  public void f8(HttpServletRequest r) { String a = r.getParameter("a"); new File(a + "x" + a); }
  public void f9(HttpServletRequest r) { new File("x".concat(r.getParameter("a"))); }
  public void f10(HttpServletRequest r) { new File(r.getParameter("a").concat("x")); }
  public void f11(HttpServletRequest r, Statement st) throws Exception { st.execute(r.getParameter("a") + "x"); }
  public void f12(HttpServletRequest r, Statement st) throws Exception { String q = "select "; q += r.getParameter("a"); st.execute(q); }
  public void f13(HttpServletRequest r) { new File(new StringBuilder("x").append(r.getParameter("a")).toString()); }
  public void f14(HttpServletRequest r) { new File(String.format("%s", r.getParameter("a"))); }
  public void f15(HttpServletRequest r) { new File(String.join(",", r.getParameter("a"))); }
  public void f16(HttpServletRequest r) { int n = 3; new File("x" + n); }
  public void f17(HttpServletRequest r) { new File("x" + 3 + "y"); }
  public void f18(HttpServletRequest r) { new File("x" + r.getParameter("a").length()); }
  public void f19(String s) { new File("x" + s.length()); }
  public void f20(String s) { int n = s.length(); new File(String.valueOf(n)); }
  public void f21(HttpServletRequest r) { new File(r.getParameter("a") + 1); }
}
