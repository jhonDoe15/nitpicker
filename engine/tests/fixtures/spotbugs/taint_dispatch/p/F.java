package p;
import java.util.*;
import javax.servlet.http.*;
public class F {
  static String sf = "z";
  String f = "z";
  static String konst() { return "k"; }
  static String args(String a, String b) { return b; }
  static <T> T gen(T t) { return t; }
  static String field() { return new F().f; }
  static String sfield() { return sf; }
  static String cond(boolean c, String s) { return c ? "a" : s; }
  static String sb(String s) { StringBuilder b = new StringBuilder(); b.append("x").append(s); return b.toString(); }
  static String loop(String s) { String r = ""; for (int i = 0; i < 2; i++) r = r.concat(s); return r; }
  static String fromReq(HttpServletRequest r) { return r.getParameter("a"); }
  static String ifaceCall(H.I i) { return i.k(); }
  static String indy(String s) { return s + "x"; }
  static String withTry(String s) { try { return s.trim(); } catch (RuntimeException e) { return "a"; } }
  static String thrower(String s) { if (s.isEmpty()) throw new IllegalStateException(); return "a"; }
  static String ret2(String a, String b) { if (a.isEmpty()) return a; return b; }
  String inst(String s) { return s; }
  static String[] constArr() { return new String[] {"a"}; }
  static String konstViaLocal() { String x = "a"; String y = x; return y; }
  static List<String> list() { List<String> l = new ArrayList<>(); l.add("a"); return l; }
  static String d0(String s) { return d1(s); }
  static String d1(String s) { return d2(s); }
  static String d2(String s) { return d3(s); }
  static String d3(String s) { return d4(s); }
  static String d4(String s) { return d5(s); }
  static String d5(String s) { return d6(s); }
  static String d6(String s) { return d7(s); }
  static String d7(String s) { return d8(s); }
  static String d8(String s) { return d9(s); }
  static String d9(String s) { return d10(s); }
  static String d10(String s) { return d11(s); }
  static String d11(String s) { return d12(s); }
  static String d12(String s) { return "q"; }
}
