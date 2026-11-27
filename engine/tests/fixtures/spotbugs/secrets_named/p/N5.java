package p;
import java.security.KeyStore;
public class N5 {
  static class NotMap5 { public Object put(Object k, Object v) { return null; } public Object setProperty(String k, String v) { return null; } }
  static class PC5 extends javax.security.auth.callback.PasswordCallback { PC5() { super("x", false); } }
  static class KS5 extends KeyStore { KS5() { super(null, null, null); } }
  void q1(NotMap5 m) { m.put("password", "x"); }
  void q2(NotMap5 m) { m.setProperty("password", "x"); }
  void j1(com.jcraft.jsch.JSch j, String s) { j.addIdentity(s, "p"); }
  void j2(com.jcraft.jsch.JSch j, String s) { j.addIdentity("n", s); }
  void s1(PC5 p) { p.setPassword("x".toCharArray()); }
  void s2(KS5 k) throws Exception { k.load(null, "x".toCharArray()); }
  void t1(KeyStore k) throws Exception { k.load(null, "x".toUpperCase().toCharArray()); }
  void t2(KeyStore k) throws Exception { k.load(null, "x".intern().toCharArray()); }
  void t3(KeyStore k) throws Exception { k.load(null, "x".substring(1).toCharArray()); }
  void t4(KeyStore k) throws Exception { k.load(null, "x".concat("y").toCharArray()); }
  void t5(KeyStore k) throws Exception { k.load(null, "x".toLowerCase().toCharArray()); }
  void t6(KeyStore k) throws Exception { k.load(null, System.getenv("x").toCharArray()); }
  void t7() throws Exception { new javax.crypto.spec.SecretKeySpec("x".trim().getBytes(), "A"); }
  void t8() throws Exception { new javax.crypto.spec.SecretKeySpec(new byte[] {(byte) 1}, "A"); }
  void t9(byte b) throws Exception { new javax.crypto.spec.SecretKeySpec(new byte[] {1, b}, "A"); }
  void t10() throws Exception { new javax.crypto.spec.SecretKeySpec(new byte[] {-1, 0x7f}, "A"); }
  void t11(KeyStore k) throws Exception { k.load(null, new char[] {'a', (char) 66}); }
  static final int N = 5;
  void t12() throws Exception { new javax.crypto.spec.SecretKeySpec(new byte[] {N}, "A"); }
  void t13() throws Exception { new java.security.spec.RSAPublicKeySpec(java.math.BigInteger.ONE, new java.math.BigInteger("5")); }
  void t14() throws Exception { new java.security.spec.RSAPublicKeySpec(new java.math.BigInteger("5", 10), java.math.BigInteger.ONE); }
  void t15() throws Exception { new java.security.spec.RSAPublicKeySpec(new java.math.BigInteger(1, new byte[] {1}), java.math.BigInteger.ONE); }
  void t16() throws Exception { new java.security.spec.RSAPublicKeySpec(new java.math.BigInteger(new byte[] {1}), java.math.BigInteger.ONE); }
}
