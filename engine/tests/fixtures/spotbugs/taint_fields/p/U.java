package p;
import java.io.File;
import java.util.*;
import javax.servlet.http.*;
public class U {
  private final String fin = "k";
  private final String fin2;
  private String onlyConst = "c";
  private static final String SCOMP = "a" + System.nanoTime();
  U(String s) { fin2 = s; }
  public void b1(HttpServletRequest r) { new File(r.getParameter("x")); }
  public void b2(HttpServletRequest r) { String s = r.getParameter("x"); new File("/" + s); }
  public void b3() { new File(fin); }
  public void b4() { new File(fin2); }
  public void b5() { new File(onlyConst); }
  public void b6() { new File(SCOMP); }
  public void b7(boolean c, String s) { String t = c ? "a" : s; new File(t); }
  public void b8(boolean c, String s) { String t = "a"; if (c) t = s; new File(t); }
  public void b9(String s) { String t = s; t = "a"; new File(t); }
  public void b10(String s) { StringBuilder b = new StringBuilder("a"); new File(b.toString()); }
  public void b11(String s) { StringBuilder b = new StringBuilder(); b.append(s); b.append("x"); new File(b.toString()); }
  public void b12(String s) { List<String> l = new ArrayList<>(); l.add(s); new File(l.get(0)); }
  public void b13() { List<String> l = new ArrayList<>(); l.add("a"); new File(l.get(0)); }
  public void b14(String s) { Map<String,String> m = new HashMap<>(); m.put("k", s); new File(m.get("k")); }
  public void b15() { new File(getClass().getName()); }
  public void b16(Enum<?> e) { new File(e.name()); }
  public void b17(String s) { String t = ""; t += s; new File(t); }
  public void b18(String s) { new File(String.join("/", "a", s)); }
  public void b19(String s) { new File(String.join("/", "a", "b")); }
  public void b20(String s) { new File(inst(s)); }
  public String inst(String s) { return "z"; }
  public void b21(String s) { new File(priv(s)); }
  private String priv(String s) { return "z"; }
  public void b22(Other o) { new File(o.name()); }
  public void b23(String s) { new File(Other.konst()); }
  public void b24(String s) { new File(Other.pass(s)); }
  public void b25(String s) { char[] c = s.toCharArray(); new File(new String(c)); }
  public void b26(String s) { new File(s.length() > 3 ? "a" : "b"); }
  public void b27(String s) { new File(toString()); }
  public void b28(String s) { new File(String.valueOf(s)); }
  public void b29(Object o) { new File(String.valueOf(o)); }
  public void b30(Object o) { new File(o.toString()); }
  public void b31(Integer i) { new File(i.toString()); }
  public void b32(String s) { if (s.equals("a")) new File(s); }
  public void b33(String s) { String t = null; new File(t); }
  public void b34(HttpServletRequest r) { new File(r.getHeader("h").trim()); }
  public void b35(HttpServletRequest r) { new File(r.getContextPath()); }
  public void b36(HttpServletRequest r) { new File(Integer.toString(Integer.parseInt(r.getParameter("x")))); }
  public void b37(String s) { for (int i = 0; i < 3; i++) s = "a"; new File(s); }
  public void b38(String[] a) { for (String s : a) new File(s); }
  public void b39(String s) { new File(rec(s, 3)); }
  private String rec(String s, int n) { return n == 0 ? s : rec(s, n - 1); }
  public void b40(String s) { new File(s.split("/")[0]); }
}
class Other {
  String name() { return "q"; }
  static String konst() { return "q"; }
  static String pass(String s) { return s; }
}
