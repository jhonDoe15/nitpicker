package p;
import java.security.KeyStore;
public class V5 {
  static char[] snf = "a".toCharArray();
  static final char[] sf = "a".toCharArray();
  private char[] pl;
  char[] ql;
  static char[] sl;
  private static char[] psl;
  static final char[] sfm;
  static { sfm = make(); }
  static char[] make() { return "x".toCharArray(); }
  void a1(KeyStore k) throws Exception { k.load(null, snf); }
  void a2(KeyStore k) throws Exception { k.load(null, sf); }
  void a3(KeyStore k) throws Exception { k.load(null, pl); }
  void a4(KeyStore k) throws Exception { k.load(null, ql); }
  void a5(KeyStore k) throws Exception { k.load(null, sl); }
  void a6(KeyStore k) throws Exception { k.load(null, psl); }
  void a7(KeyStore k) throws Exception { k.load(null, sfm); }
  void w() { pl = "x".toCharArray(); ql = "x".toCharArray(); sl = "x".toCharArray(); psl = "x".toCharArray(); }
  void b3(KeyStore k) throws Exception { k.load(null, pl); }
  void b4(KeyStore k) throws Exception { k.load(null, ql); }
  void b5(KeyStore k) throws Exception { k.load(null, sl); }
  void b6(KeyStore k) throws Exception { k.load(null, psl); }
}
