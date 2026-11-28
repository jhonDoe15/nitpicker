package c;
import java.security.*;
public class F3 {
  static String s1;
  static { s1 = "MD5"; }
  static String s2 = "MD5";
  String i1 = "MD5";
  String i2 = "MD5";
  String i3;
  String i4 = "MD5";
  F3() { }
  F3(int x) { i3 = "MD5"; }
  F3(String y) { this(); i2 = "MD5"; }
  void ma() throws Exception { MessageDigest.getInstance(s1); }
  void mb() throws Exception { MessageDigest.getInstance(s2); }
  void mc() throws Exception { MessageDigest.getInstance(i1); }
  void md() throws Exception { MessageDigest.getInstance(i2); }
  void me() throws Exception { MessageDigest.getInstance(i3); }
  void mf() throws Exception { MessageDigest.getInstance(G3.Y); }
  void mg(G3 o) throws Exception { MessageDigest.getInstance(o.z); }
  void mh() throws Exception { MessageDigest.getInstance(this.i4); }
  void mi(F3 o) throws Exception { MessageDigest.getInstance(o.i4); }
  void mj() throws Exception { String s = "MD5"; for (int k = 0; k < 2; k++) { MessageDigest.getInstance(s); } }
  void mk() throws Exception { String s = "MD5"; for (int k = 0; k < 2; k++) { MessageDigest.getInstance(s); s = "SHA-256"; } }
  void ml(String[] a) throws Exception { String s = "MD5"; MessageDigest.getInstance(s = "MD5"); }
  void mm() throws Exception { MessageDigest.getInstance(G3.W); }
  void mn() throws Exception { MessageDigest.getInstance(G3.V); }
  void mo() throws Exception { javax.crypto.Cipher.getInstance(G3.C); }
  void mp() throws Exception { String s = "MD5"; Runnable r = () -> { try { MessageDigest.getInstance(s); } catch (Exception e) {} }; }
  void mq() throws Exception { MessageDigest.getInstance(new String("MD5")); }
  void mr() throws Exception { MessageDigest.getInstance("md5".toUpperCase()); }
  void ms() throws Exception { MessageDigest.getInstance("MD5".intern()); }
  void mt() throws Exception { String s = null; s = "MD5"; MessageDigest.getInstance(s); }
  void mu() throws Exception { MessageDigest.getInstance((String) "MD5"); }
  void mv() throws Exception { MessageDigest.getInstance(("MD5")); }
  void mw() throws Exception { MessageDigest.getInstance(G3.U); }
}
