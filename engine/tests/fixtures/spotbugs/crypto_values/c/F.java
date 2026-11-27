package c;
import java.security.*;
public class F {
  String a = "MD5";
  String b;
  String c = "MD5";
  static String d = "MD5";
  private String e = "MD5";
  final String g = "MD5";
  String h = "MD5";
  String i;
  F() { b = "MD5"; }
  void setC() { c = "SHA-256"; }
  void setH() { h = "MD5"; }
  void ma() throws Exception { MessageDigest.getInstance(a); }
  void mb() throws Exception { MessageDigest.getInstance(b); }
  void mc() throws Exception { MessageDigest.getInstance(c); }
  void md() throws Exception { MessageDigest.getInstance(d); }
  void me() throws Exception { MessageDigest.getInstance(e); }
  void mg() throws Exception { MessageDigest.getInstance(g); }
  void mh() throws Exception { MessageDigest.getInstance(h); }
  void mi() throws Exception { MessageDigest.getInstance(G.X); }
  void mj() throws Exception { MessageDigest.getInstance(G.Y); }
  void mk(G o) throws Exception { MessageDigest.getInstance(o.z); }
  void ml() throws Exception { MessageDigest.getInstance(alg()); }
  void mm() throws Exception { MessageDigest.getInstance("MD" + "5"); }
  void mn(boolean x) throws Exception { String s; if (x) s = "MD5"; else s = "SHA-256"; MessageDigest.getInstance(s); }
  void mo(boolean x) throws Exception { String s = "MD5"; if (x) s = "MD5"; MessageDigest.getInstance(s); }
  void mp(boolean x) throws Exception { MessageDigest.getInstance(x ? "MD5" : "MD5"); }
  void mq(boolean x) throws Exception { String s = "SHA-256"; if (x) s = "MD5"; MessageDigest.getInstance(s); }
  void mr() throws Exception { String s = "SHA-256"; s = "MD5"; MessageDigest.getInstance(s); }
  void ms() throws Exception { MessageDigest.getInstance("MD5".toString()); }
  void mt() throws Exception { i = "MD5"; MessageDigest.getInstance(i); }
  void mu() throws Exception { MessageDigest.getInstance(String.valueOf("MD5")); }
  String alg() { return "MD5"; }
  void mv(boolean x) throws Exception { Cipher2.go(x ? "DES" : "AES/GCM/NoPadding"); }
  void mw(boolean x) throws Exception { javax.crypto.Cipher.getInstance(x ? "DES" : "DES"); }
  void mx(boolean x) throws Exception { javax.crypto.Cipher.getInstance(x ? "AES/GCM/NoPadding" : "DES"); }
}
class G { static final String X = "MD5"; static String Y = "MD5"; String z = "MD5"; }
class Cipher2 { static void go(String s) throws Exception { javax.crypto.Cipher.getInstance(s); } }
