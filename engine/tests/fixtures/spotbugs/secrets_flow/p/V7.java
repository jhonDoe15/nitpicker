package p;
import java.security.KeyStore;
import java.sql.DriverManager;
public class V7 {
  void c1(boolean b) throws Exception { String p; if (b) p = "x"; else p = "y"; DriverManager.getConnection("u", "v", p); }
  void c2(boolean b, String s) throws Exception { String p = s; if (b) p = "y"; DriverManager.getConnection("u", "v", p); }
  void c3(boolean b, String s) throws Exception { String p = "x"; if (b) p = s; DriverManager.getConnection("u", "v", p); }
  void c4(boolean b, String s) throws Exception { String p; if (b) p = s; else p = "y"; DriverManager.getConnection("u", "v", p); }
  void c5(boolean b, String s) throws Exception { String p; if (b) p = "y"; else p = s; DriverManager.getConnection("u", "v", p); }
  void c6(String s) throws Exception { String p = s; for (int i = 0; i < 3; i++) p = "y"; DriverManager.getConnection("u", "v", p); }
  void c7(String s) throws Exception { String p = "y"; for (int i = 0; i < 3; i++) p = s; DriverManager.getConnection("u", "v", p); }
  void k1(boolean b, KeyStore k, String s) throws Exception { char[] c = s.toCharArray(); if (b) c = "a".toCharArray(); k.load(null, c); }
  void k2(boolean b, KeyStore k, String s) throws Exception { char[] c = "a".toCharArray(); if (b) c = s.toCharArray(); k.load(null, c); }
  void k3(boolean b, KeyStore k, String s) throws Exception { char[] c; if (b) c = "a".toCharArray(); else c = s.toCharArray(); k.load(null, c); }
  void k4(boolean b, KeyStore k, String s) throws Exception { char[] c; if (b) c = s.toCharArray(); else c = "a".toCharArray(); k.load(null, c); }
  void k5(boolean b, KeyStore k, String s) throws Exception { k.load(null, b ? s.toCharArray() : "a".toCharArray()); }
  void k6(boolean b, KeyStore k, String s) throws Exception { k.load(null, b ? "a".toCharArray() : s.toCharArray()); }
  void k7(boolean b, KeyStore k, String s) throws Exception { char[] c = "a".toCharArray(); if (b) { c = s.toCharArray(); return; } k.load(null, c); }
}
