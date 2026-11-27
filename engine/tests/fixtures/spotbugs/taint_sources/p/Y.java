package p;
import java.io.File;
import java.sql.*;
import java.util.*;
import javax.servlet.http.*;
public class Y {
  private String tf;
  private static String stf;
  public void set(HttpServletRequest r) { tf = r.getParameter("a"); stf = r.getParameter("b"); }
  public void e1() { new File(tf); }
  public void e2() { new File(stf); }
  public void e3(HttpServletRequest r) { new File(r.getParameter("a") + "/x"); }
  public void e4(HttpServletRequest r, String u) { new File(u + r.getParameter("a")); }
  public void e5(HttpServletRequest r, Statement st) throws Exception { st.execute("select " + r.getParameter("a")); }
  public void e6(HttpServletRequest r, Statement st) throws Exception { st.execute(r.getParameter("a")); }
  public void e7(HttpServletRequest r) { String s = r.getParameter("a"); if (s == null) return; new File(s); }
  public void e8(HttpServletRequest r) { StringBuilder b = new StringBuilder(); fill(b, r.getParameter("a")); new File(b.toString()); }
  private void fill(StringBuilder b, String s) { b.append(s); }
  public void e9(String s) { StringBuilder b = new StringBuilder(); fill(b, s); new File(b.toString()); }
  public void e10(HttpServletRequest r) { new File(wrap(r.getParameter("a"))); }
  private String wrap(String s) { return s.trim(); }
  public void e11(HttpServletRequest r) { new File(readField()); }
  private String readField() { return tf; }
  public void e12(HttpServletRequest r) { new File(viaLib(r.getParameter("a"))); }
  private String viaLib(String s) { return q.L.p(s); }
  public void e13(HttpServletRequest r) { new File(Z.pass(r.getParameter("a"))); }
  public void e14(HttpServletRequest r) { new File(new Z().virt(r.getParameter("a"))); }
  public void e15(HttpServletRequest r) { new File(d1(r.getParameter("a"))); }
  private String d1(String s) { return d2(s); }
  private String d2(String s) { return d3(s); }
  private String d3(String s) { return d4(s); }
  private String d4(String s) { return d5(s); }
  private String d5(String s) { return d6(s); }
  private String d6(String s) { return s; }
  public void e16(HttpServletRequest r) { String[] a = new String[1]; a[0] = r.getParameter("a"); new File(a[0]); }
  public void e17() { String[] a = new String[1]; a[0] = "x"; new File(a[0]); }
  public void e18(HttpServletRequest r) { List<String> l = new ArrayList<>(); l.add(r.getParameter("a")); new File(l.get(0)); }
  public void e19(HttpServletRequest r) { Runnable x = () -> new File(r.getParameter("a")); }
  public void e20(String s) { Runnable x = () -> new File(s); }
  public void e21() { Runnable x = () -> new File("a"); }
  public void e22(String s) { Object o = new Object() { void f() { new File(s); } }; }
  public void e23(HttpServletRequest r) { String s = r.getParameter("a"); String t = s; s = "x"; new File(t); }
  public void e24(HttpServletRequest r, boolean c) { String s = c ? r.getParameter("a") : null; new File(s); }
  public void e25(HttpServletRequest r, boolean c, String u) { String s = c ? r.getParameter("a") : u; new File(s); }
  public void e26(HttpServletRequest r) { new File(String.valueOf(r.getParameter("a"))); }
  public void e27(HttpServletRequest r) { new File(r.getParameter("a").toLowerCase()); }
  public void e28(HttpServletRequest r) { new File(java.net.URLEncoder.encode(r.getParameter("a"))); }
  public void e29(HttpServletRequest r) { new File(r.getParameter("a").replaceAll("[^a-z]", "")); }
  public void e30(HttpServletRequest r) { Cookie[] c = r.getCookies(); new File(c[0].getValue()); }
  public void e31(HttpServletRequest r) { new File(r.getRequestURI()); }
  public void e32(HttpServletRequest r) { new File(r.getPathInfo()); }
  public void e33(HttpServletRequest r) { new File(r.getQueryString()); }
  public void e34(HttpServletRequest r) { new File(r.getServletPath()); }
  public void e35(HttpServletRequest r) { new File(r.getRemoteUser()); }
  public void e36(HttpServletRequest r) { new File((String) r.getAttribute("a")); }
  public void e37(HttpServletRequest r) { new File(r.getSession().getId()); }
  public void e38(HttpServletRequest r) { new File(r.getParameterValues("a")[0]); }
  public void e39(HttpServletRequest r) { new File(r.getParameterMap().get("a")[0]); }
  public void e40(HttpServletRequest r) throws Exception { new File(r.getReader().readLine()); }
}
class Z {
  static String pass(String s) { return s; }
  String virt(String s) { return s; }
}
