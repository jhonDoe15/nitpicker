package p;
import java.security.KeyStore;
import java.sql.DriverManager;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
public class V1 {
  static final char[] PW = "abc".toCharArray();
  static final String SPW = "abc";
  static String nf = "abc";
  String inst = "abc";
  char[] instc;
  V1(char[] c) { instc = c; }
  void a1(KeyStore k) throws Exception { k.load(null, "abc".toCharArray()); }
  void a2(KeyStore k) throws Exception { k.load(null, PW); }
  void a3(KeyStore k) throws Exception { char[] c = "abc".toCharArray(); k.load(null, c); }
  void a4(KeyStore k, String s) throws Exception { k.load(null, s.toCharArray()); }
  void a5(KeyStore k) throws Exception { k.load(null, ("a" + "b").toCharArray()); }
  void a6(KeyStore k, String s) throws Exception { k.load(null, (s + "b").toCharArray()); }
  void a7(KeyStore k) throws Exception { k.load(null, new char[] {'a'}); }
  void a8(KeyStore k) throws Exception { k.load(null, new char[0]); }
  void a9(KeyStore k) throws Exception { k.load(null, SPW.toCharArray()); }
  void a10(KeyStore k) throws Exception { k.load(null, nf.toCharArray()); }
  void a11(KeyStore k) throws Exception { k.load(null, System.getProperty("x").toCharArray()); }
  void a12(KeyStore k) throws Exception { k.load(null, null); }
  void a13(KeyStore k) throws Exception { k.load(null, "".toCharArray()); }
  void a14(KeyStore k, boolean b, String s) throws Exception { k.load(null, b ? "a".toCharArray() : s.toCharArray()); }
  void a15(KeyStore k) throws Exception { k.load(null, inst.toCharArray()); }
  void a16(KeyStore k) throws Exception { k.load(null, instc); }
  void a17(KeyStore k) throws Exception { k.load(null, String.valueOf(5).toCharArray()); }
  void a18(KeyStore k, char[] c) throws Exception { k.load(null, c); }
  void a19(KeyStore k, boolean b, String s) throws Exception { char[] c = s.toCharArray(); if (b) c = "a".toCharArray(); k.load(null, c); }
  void b1() throws Exception { new SecretKeySpec("k".getBytes(), "AES"); }
  void b2() throws Exception { new SecretKeySpec("k".getBytes(StandardCharsets.UTF_8), "AES"); }
  void b3() throws Exception { new SecretKeySpec("k".getBytes("UTF-8"), "AES"); }
  void b4() throws Exception { new SecretKeySpec(java.util.Base64.getDecoder().decode("aGk="), "AES"); }
  void b5(byte[] x) throws Exception { new SecretKeySpec(x, "AES"); }
  void b6() throws Exception { new SecretKeySpec(new byte[16], "AES"); }
  void b7(String s) throws Exception { new SecretKeySpec(s.getBytes(), "AES"); }
  void b8() throws Exception { byte[] k = {1, 2}; new SecretKeySpec(k, "AES"); }
  void b9() throws Exception { new SecretKeySpec(SPW.getBytes(), "AES"); }
  void b10() throws Exception { new SecretKeySpec(nf.getBytes(), "AES"); }
  void c1() throws Exception { DriverManager.getConnection("u", "v", "w"); }
  void c2(String s) throws Exception { DriverManager.getConnection(s, s, "w"); }
  void c3(String s) throws Exception { DriverManager.getConnection("u", "v", s); }
  void c4() throws Exception { DriverManager.getConnection("u", "v", SPW); }
  void c5() throws Exception { DriverManager.getConnection("u", "v", nf); }
  void c6() throws Exception { DriverManager.getConnection("u", "v", null); }
  void c7() throws Exception { DriverManager.getConnection("u", "v", ""); }
  void c8(String s) throws Exception { DriverManager.getConnection("u", "v", s + "x"); }
  void c9() throws Exception { String p = "w"; DriverManager.getConnection("u", "v", p); }
  void c10(java.util.Properties p) throws Exception { DriverManager.getConnection("u", p); }
  void c11(String s) throws Exception { DriverManager.getConnection(s, "v", s); }
}
