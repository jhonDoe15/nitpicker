package p;
import java.security.KeyStore;
import java.sql.DriverManager;
public class V6 {
  void a0(KeyStore k) throws Exception { k.load(null, f); }
  char[] f = {'a'};
  V6() { }
  void a1(KeyStore k) throws Exception { k.load(null, f); }
  void c1(boolean b) throws Exception { DriverManager.getConnection("u", "v", b ? "x" : "y"); }
  void c3() throws Exception { DriverManager.getConnection("u", "v", O6.CONST); }
  void c4() throws Exception { DriverManager.getConnection("u", "v", O6.nf); }
  void c5() throws Exception { DriverManager.getConnection("u", "v", O6.two); }
  void c6() throws Exception { DriverManager.getConnection("u", "v", O6.pub); }
  void c7() throws Exception { DriverManager.getConnection("u", "v", new O6().inst); }
  void c9() throws Exception { DriverManager.getConnection("u", "v", "abc".trim()); }
  void c10() throws Exception { DriverManager.getConnection("u", "v", new StringBuilder("a").append("b").toString()); }
  void c11() throws Exception { DriverManager.getConnection("u", "v", String.valueOf("a")); }
  void c12() throws Exception { String p = "x"; if (System.nanoTime() > 0) p = "y"; DriverManager.getConnection("u", "v", p); }
  void c13() throws Exception { DriverManager.getConnection("u", "v", O6.getPs()); }
  class In { void i(KeyStore k) throws Exception { k.load(null, f); } }
  Runnable r = () -> { try { ((KeyStore) null).load(null, f); } catch (Exception e) { } };
}
class O6 {
  static final String CONST = "c";
  static String nf = "n";
  static String two = "a";
  public static String pub = "p";
  String inst = "i";
  private static String ps = "q";
  static String getPs() { return ps; }
  void set() { two = "b"; }
}
class W6 {
  void w() { Z6.key = new byte[] {1}; Z6.pass = "x".toCharArray(); }
}
class Z6 { static byte[] key; static char[] pass; }
