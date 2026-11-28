package p;
import java.security.KeyStore;
import java.sql.DriverManager;
public class V8 {
  void c1(boolean b, String s) throws Exception { DriverManager.getConnection("u", "v", b ? s : "x"); }
  void c2(boolean b, String s) throws Exception { DriverManager.getConnection("u", "v", b ? "x" : s); }
  void c3(boolean b) throws Exception { DriverManager.getConnection("u", "v", b ? "x".trim() : "y".trim()); }
  void c4(boolean b) throws Exception { DriverManager.getConnection("u", "v", b ? "x" : "y".trim()); }
  void c5(boolean b, String s) throws Exception { DriverManager.getConnection("u", "v", b ? s.trim() : "y".trim()); }
  void c6(boolean b) throws Exception { String p = b ? "x" : "y"; DriverManager.getConnection("u", "v", p); }
  void c7(boolean b, String s) throws Exception { String p; if (b) p = s; else p = "y"; DriverManager.getConnection("u", "v", p); }
  void c8(boolean b, String s) throws Exception { String p; if (b) p = "y"; else p = s; DriverManager.getConnection("u", "v", p); }
  void k1(boolean b, KeyStore k) throws Exception { char[] c; if (b) c = "a".toCharArray(); else c = "b".toCharArray(); k.load(null, c); }
  void k2(boolean b, KeyStore k) throws Exception { char[] c; if (b) c = "a".toCharArray(); else c = new char[] {'x'}; k.load(null, c); }
}
