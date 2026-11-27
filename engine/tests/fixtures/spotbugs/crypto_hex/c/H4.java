package c;
import java.security.*;
public class H4 {
  MessageDigest m;
  byte[] d;
  String a() { String s = ""; for (int i = 0; i < 2; i += Integer.toHexString(i).length()) { m.digest(); } return s; }
  String b() { try { Integer.toHexString(1); } catch (RuntimeException e) { Integer.toHexString(2); } finally { m.digest(); } return ""; }
  String c() { try { m.toString(); } catch (RuntimeException e) { Integer.toHexString(2); } finally { m.digest(); } return ""; }
  String e() { try { Integer.toHexString(1); } finally { m.digest(); } return ""; }
  String f() { boolean x = d.length > 1; String s = x ? Integer.toHexString(1) : String.valueOf(m.digest()); return s; }
  String g() { while (Integer.toHexString(d.length).isEmpty()) { m.digest(); } return ""; }
  String h() { do { m.digest(); } while (Integer.toHexString(d.length).isEmpty()); return ""; }
  String i() { switch (d.length) { case 1: Integer.toHexString(1); break; default: m.digest(); } return ""; }
  String j() { return Integer.toHexString(m.digest().length); }
  String k() { return Integer.toHexString(d.length) + m.digest().length; }
  String l() { synchronized (this) { m.digest(); } return Integer.toHexString(1); }
  String n() { assert m.digest() != null; return Integer.toHexString(1); }
  String o() { for (byte b : m.digest()) { Integer.toHexString(b); } return ""; }
  String p() { String q = Integer.toHexString(1); class X { void z() { m.digest(); } } return q; }
  String r() { Object o = new Object() { String t = Integer.toHexString(1); }; m.digest(); return ""; }
}
class H5 {
  byte[] x = digestIt();
  String y;
  static byte[] digestIt() { try { return MessageDigest.getInstance("SHA-256").digest(); } catch (Exception e) { return null; } }
  java.security.MessageDigest md;
  byte[] z = md.digest();
  H5() {
    y = Integer.toHexString(1);
  }
  H5(int q) {
    this();
    y = Integer.toHexString(q);
  }
  H5(String w) {
    super();
    y = Integer.toHexString(2);
  }
}
class H6 {
  static java.security.MessageDigest md;
  static byte[] z = md.digest();
  static String y = Integer.toHexString(1);
}
class H7 {
  java.security.MessageDigest md;
  String y = Integer.toHexString(1);
  byte[] z = md.digest();
  H7() { }
}
