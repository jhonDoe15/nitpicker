package p;
import java.security.KeyStore;
import javax.crypto.spec.PBEKeySpec;
public class V2 {
  char[] later;
  String sf;
  String sp;
  V2(String s) { sp = s; }
  void a1(KeyStore k) throws Exception { k.load(null, later); }
  void a2() { later = "x".toCharArray(); }
  void a3(KeyStore k, boolean b) throws Exception { k.load(null, b ? "a".toCharArray() : "b".toCharArray()); }
  void a4(KeyStore k) throws Exception { char[] c = null; for (int i = 0; i < 2; i++) c = "a".toCharArray(); k.load(null, c); }
  void a5(KeyStore k) throws Exception { k.load(null, O2.X); }
  void a6(KeyStore k) throws Exception { k.load(null, sp.toCharArray()); }
  void a7(KeyStore k) throws Exception { k.load(null, sf.toCharArray()); }
  void a8(KeyStore k) throws Exception { k.load(null, "abc".toString().toCharArray()); }
  void a9(KeyStore k) throws Exception { k.load(null, "abc".trim().toCharArray()); }
  void a10(KeyStore k) throws Exception { char[] c = new char[3]; c[0] = 'a'; k.load(null, c); }
  void a11(KeyStore k) throws Exception { k.load(null, "abc".toCharArray().clone()); }
  void a12(KeyStore k) throws Exception { k.load(null, String.valueOf("abc").toCharArray()); }
  void a13(KeyStore k) throws Exception { k.load(null, new String("abc").toCharArray()); }
  void a14(KeyStore k) throws Exception { char[] c = "abc".toCharArray(); char[] d = c; k.load(null, d); }
  void a15(KeyStore k) throws Exception { Object o = "abc".toCharArray(); k.load(null, (char[]) o); }
  void a16(KeyStore k) throws Exception { k.load(null, new StringBuilder("a").toString().toCharArray()); }
  void a17(KeyStore k) throws Exception { k.load(null, Character.toChars(65)); }
  void a18(KeyStore k) throws Exception { k.load(null, new char[] {}); }
  void a19(KeyStore k, char x) throws Exception { k.load(null, new char[] {x}); }
  void a20(KeyStore k) throws Exception { char[] c = "a".toCharArray(); c = later; k.load(null, c); }
  void s1(char[] s) { new PBEKeySpec(s, "salt".getBytes(), 1); }
  void s2() { new PBEKeySpec("p".toCharArray(), null, 1); }
}
class O2 { static final char[] X = {'a'}; }
