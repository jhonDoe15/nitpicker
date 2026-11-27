package p;
import java.security.KeyStore;
public class V3 {
  char[] later;
  char[] never;
  String s1;
  String s2;
  String s3;
  static String st;
  Object o;
  void a0(KeyStore k) throws Exception { k.load(null, never); }
  void a1(KeyStore k) throws Exception { k.load(null, later); }
  void a2() { later = "x".toCharArray(); }
  void a3(KeyStore k) throws Exception { k.load(null, later); }
  void b1(KeyStore k) throws Exception { k.load(null, s1.toCharArray()); }
  void b2(String p) { s1 = p; }
  void b3(KeyStore k) throws Exception { k.load(null, s1.toCharArray()); }
  void b4(KeyStore k) throws Exception { k.load(null, st.toCharArray()); }
  void b5(KeyStore k) throws Exception { k.load(null, ((String) o).toCharArray()); }
  void b6(KeyStore k, V3 v) throws Exception { k.load(null, v.s2.toCharArray()); }
  void b7(KeyStore k) throws Exception { k.load(null, this.s3.toCharArray()); }
  void b8() { s3 = String.valueOf(System.nanoTime()); }
  void b9(KeyStore k) throws Exception { k.load(null, this.s3.toCharArray()); }
  void c1(KeyStore k) throws Exception { k.load(null, System.getenv("x").toCharArray()); }
  void c2(KeyStore k) throws Exception { k.load(null, new Object().toString().toCharArray()); }
  void c3(KeyStore k) throws Exception { k.load(null, java.util.UUID.randomUUID().toString().toCharArray()); }
  void c4(KeyStore k) throws Exception { k.load(null, mk().toCharArray()); }
  String mk() { return "x"; }
  void c5(KeyStore k) throws Exception { k.load(null, mk2().toCharArray()); }
  String mk2() { return System.getenv("y"); }
}
