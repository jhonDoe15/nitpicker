package c;
import java.security.*;
public class H2 {
  String a(MessageDigest m) { byte[] d = m.digest(); StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString(b)); return s.toString(); }
  String b(MessageDigest m, byte[] d) { m.digest(); StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString(b)); return s.toString(); }
  String c(MessageDigest m) { byte[] d = m.digest(); StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString(b & 0xff)); return s.toString(); }
  String e(MessageDigest m) { byte[] d = m.digest(new byte[2]); StringBuilder s = new StringBuilder(); for (int i = 0; i < d.length; i++) s.append(Integer.toHexString(d[i])); return s.toString(); }
  String f(MessageDigest m) { byte[] d = m.digest(); return Integer.toHexString(d[0]); }
  String g(MessageDigest m, byte x) { m.digest(); return Integer.toHexString(x); }
  String h(MessageDigest m, byte[] d) { StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString(b)); m.digest(); return s.toString(); }
  String i(MessageDigest m) { byte[] d = m.digest(); StringBuilder s = new StringBuilder(); for (byte b : d) { s.append(Integer.toHexString(b)); s.append(Integer.toHexString(b)); } return s.toString(); }
  String j(MessageDigest m) { byte[] d = m.digest(); StringBuilder s = new StringBuilder(); for (byte b : d) { int v = b; s.append(Integer.toHexString(v)); } return s.toString(); }
  String k(MessageDigest m) { byte[] d = m.digest(); return Long.toHexString(d[0]) + Integer.toString(d[1], 16) + String.format("%x", d[2]); }
  String l(MessageDigest m) { byte[] d = m.digest(); StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString((int) b)); return s.toString(); }
  String n(javax.crypto.Mac m) { byte[] d = m.doFinal(); StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString(b)); return s.toString(); }
  String o(MessageDigest m) throws Exception { byte[] d = new byte[3]; m.digest(d, 0, 3); StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString(b)); return s.toString(); }
  String p(MessageDigest m) { byte[] d = m.digest(); StringBuilder s = new StringBuilder();
    for (byte b : d) {
      s.append(Integer.toHexString(b));
    }
    return s.toString(); }
  String q(MessageDigest m) { byte[] d = m.digest(); StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString(b)).append(Integer.toHexString(b)); return s.toString(); }
  String r(MessageDigest m) { Runnable x = () -> m.digest(); byte[] d = new byte[1]; return Integer.toHexString(d[0]); }
  String t(MessageDigest m) { byte[] d = m.digest(); short v = d[0]; return Integer.toHexString(v) + Integer.toHexString(Byte.toUnsignedInt(d[1])); }
  String u(java.security.MessageDigest m) { byte[] d = m.digest(); return Integer.toHexString(d[0] >> 4) + Integer.toHexString(d[0] + 1); }
}
