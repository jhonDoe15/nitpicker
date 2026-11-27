package c;
import java.security.*;
public class F4 {
  void a(int k) throws Exception { String s; switch (k) { case 1: s = "MD5"; break; default: s = "MD5"; } MessageDigest.getInstance(s); }
  void b(int k) throws Exception { MessageDigest.getInstance(k > 1 ? (k > 2 ? "MD5" : "MD5") : "MD5"); }
  void c() throws Exception { final String a = "MD"; MessageDigest.getInstance(a + "5"); }
  void d() throws Exception { String a = "MD"; MessageDigest.getInstance(a + "5"); }
  void e() throws Exception { MessageDigest.getInstance(I4.K); }
  void f() throws Exception { MessageDigest.getInstance(P4.Q); }
  void g() throws Exception { MessageDigest.getInstance(F4b.R); }
  void h(F4b o) throws Exception { MessageDigest.getInstance(o.t); }
  void i() throws Exception { String s = "MD5"; try { s = "MD5"; } catch (RuntimeException e) { s = "SHA-256"; } MessageDigest.getInstance(s); }
  void j(F4b o) throws Exception { MessageDigest.getInstance(o.u); }
  void k(F4b o) throws Exception { MessageDigest.getInstance(o.v); }
  void l(F4b o) throws Exception { MessageDigest.getInstance(o.w); }
  void m() throws Exception { String s = "MD5"; String t = s; MessageDigest.getInstance(t); }
  void n() throws Exception { String s = "SHA-256"; MessageDigest.getInstance(s = "MD5"); }
  void o(boolean x) throws Exception { String s = "MD5"; if (x) { MessageDigest.getInstance(s); } s = "SHA-256"; }
  void p(boolean x) throws Exception { String s = x ? "MD5" : null; MessageDigest.getInstance(s); }
  void q() throws Exception { MessageDigest.getInstance(F4b.S); }
  void r() throws Exception { MessageDigest.getInstance(F4b.T2); }
}
interface I4 { String K = "MD5"; }
class P4 { static final String Q = new String("MD5"); }
class F4b {
  static String R = "MD5";
  String t = "MD5";
  String u;
  String v = "MD5";
  String w = "MD5";
  static String S = null;
  static String T2;
  F4b() { u = "MD5"; }
  F4b(int x) { this(); }
  void setV() { v = null; }
  void setW() { Runnable r = () -> { w = "MD5"; }; }
  static { if (Math.random() > 0.5) S = "MD5"; }
  static void t2() { T2 = "MD5"; T2 = "MD5"; }
}
class Other { void set(F4b o) { o.t = "MD5"; F4b.R = "MD5"; } }
