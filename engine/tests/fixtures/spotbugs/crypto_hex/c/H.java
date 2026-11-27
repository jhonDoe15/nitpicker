package c;
import java.security.*;
public class H {
  String a(byte[] d) { StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString(b)); return s.toString(); }
  String b(byte[] d) { StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString(b & 0xff)); return s.toString(); }
  String c(byte[] d) { StringBuilder s = new StringBuilder(); for (int i = 0; i < d.length; i++) s.append(Integer.toHexString(d[i])); return s.toString(); }
  String e(byte x) { return Integer.toHexString(x); }
  String f(byte[] d) { String s = ""; for (byte b : d) s += Integer.toHexString(0xff & b); return s; }
  String g(byte[] d) { StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString((int) b)); return s.toString(); }
  String h() throws Exception { byte[] d = MessageDigest.getInstance("SHA-256").digest(new byte[1]); StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString(b)); return s.toString(); }
  String i(byte[] d) { StringBuilder s = new StringBuilder(); for (byte b : d) { int v = b; s.append(Integer.toHexString(v)); } return s.toString(); }
  String j(byte[] d) { StringBuilder s = new StringBuilder(); for (byte b : d) s.append(Integer.toHexString(b)).append(Integer.toHexString(b)); return s.toString(); }
  String k(byte[] d) { return Integer.toHexString(d[0]) + Long.toHexString(d[1]) + Integer.toString(d[2], 16); }
  String l(short x, char y) { return Integer.toHexString(x) + Integer.toHexString(y); }
}
