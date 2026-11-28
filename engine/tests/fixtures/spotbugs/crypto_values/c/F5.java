package c;
import java.security.*;
public class F5 {
  String a;
  String b;
  String c;
  F5(boolean x) { if (x) { a = "MD5"; } b = "MD5"; try { c = "MD5"; } finally { } }
  void ma() throws Exception { MessageDigest.getInstance(a); }
  void mb() throws Exception { MessageDigest.getInstance(b); }
  void mc() throws Exception { MessageDigest.getInstance(c); }
  void md() throws Exception { MessageDigest m = MessageDigest
      .getInstance(
         "MD5"); }
  void me() throws Exception { javax.crypto.Cipher
      .getInstance(
         "DES"); }
}
class F6 { String d; String e = "MD5"; F6() { d = "MD5"; } F6(int x) { this(); e = "MD5"; d = "MD5"; }
  void m() throws Exception { MessageDigest.getInstance(d); MessageDigest.getInstance(e); } }
class F7 { String d; { d = "MD5"; } void m() throws Exception { MessageDigest.getInstance(d); } }
class F8 { String d; F8() { this.d = "MD5"; } void m() throws Exception { MessageDigest.getInstance(this.d); } }
class F9 { String d; F9() { init(); } void init() { d = "MD5"; } void m() throws Exception { MessageDigest.getInstance(d); } }
class F10 extends F9 { void n() throws Exception { MessageDigest.getInstance(d); } }
class F11 { protected String d = "MD5"; }
class F12 extends F11 { F12() { d = "MD5"; } void n() throws Exception { MessageDigest.getInstance(d); MessageDigest.getInstance(super.d); } }
class F13 { private String d = "MD5"; void n() throws Exception { MessageDigest.getInstance(d); } void s() { d += ""; } }
class F14 { private static String d = "MD5"; void n() throws Exception { MessageDigest.getInstance(d); } }
class F15 { private static String d; void n() throws Exception { MessageDigest.getInstance(d); } }
