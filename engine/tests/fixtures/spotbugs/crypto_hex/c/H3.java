package c;
import java.security.*;
public class H3 {
  String a(MessageDigest m) { m.digest(); return Integer.toHexString(42); }
  String b(MessageDigest m, String x) { m.digest(); return Integer.toHexString(x.length()); }
  String c(MessageDigest m, byte[] d) {
    StringBuilder s = new StringBuilder();
    for (int i = 0; i < 2; i++) {
      if (i == 1) s.append(Integer.toHexString(d[i]));
      m.digest();
    }
    return s.toString();
  }
  String d(
      MessageDigest m,
      byte[] d) {
    int z = 1;
    m.digest();
    z++;
    String a = Integer.toHexString(d[0]);
    String b = Integer.toHexString(d[1]);
    return a + b + z;
  }
  String e(byte[] d) { org.apache.commons.codec.digest.DigestUtils.md5(d); return Integer.toHexString(d[0]); }
  String f(O2 m, byte[] d) { m.digest(); return Integer.toHexString(d[0]); }
  String g(MessageDigest m, byte[] d) { m.update(d); return Integer.toHexString(d[0]); }
  String h(byte[] d) throws Exception { MessageDigest.getInstance("SHA-256").digest(d); return Long.toHexString(d[0]); }
  String i(MessageDigest m, byte[] d) {
    m.digest();
    return Integer.toHexString(d[0]); }
  String j(MessageDigest m, byte[] d) { m.digest(); Runnable r = () -> Integer.toHexString(d[0]); return ""; }
  String k(MessageDigest m, byte[] d) { m.digest(); return Integer.toHexString(d[0]) + Integer.toHexString(d[1]); }
  String l(MessageDigest m, byte[] d) { m.digest(); return Integer.toString(d[0], 16) + Integer.toUnsignedString(d[1], 16) + Integer.toOctalString(d[2]) + Integer.toBinaryString(d[3]); }
  String n(MessageDigest m, byte[] d) { m.digest(); return String.valueOf(Character.forDigit(d[0], 16)) + java.util.HexFormat.of().formatHex(d); }
  String o(MessageDigest m, byte[] d) { m.digest(); return Short.toString(d[0]) + Byte.toString(d[0]); }
  String p(MessageDigest m, byte[] d) {
    String q = "";
    if (d.length > 0) { m.digest(); } else { q = Integer.toHexString(d[0]); }
    return q; }
  String q(MessageDigest m, byte[] d) {
    String a = Integer.toHexString(d[0]);
    m.digest();
    String b = Integer.toHexString(d[1]);
    return a + b; }
  String r(MessageDigest m, byte[] d) throws Exception { try { m.digest(); } finally { Integer.toHexString(d[0]); } return ""; }
  H3() { MessageDigest m = null; m.digest(); Integer.toHexString(1); }
  static { try { MessageDigest.getInstance("SHA-256").digest(); } catch (Exception e) {} Integer.toHexString(1); }
}
abstract class O2 extends MessageDigest { O2() { super("x"); } }
