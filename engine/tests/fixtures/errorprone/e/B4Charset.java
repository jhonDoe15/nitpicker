package e;

import static java.nio.charset.StandardCharsets.UTF_16;

import java.nio.charset.StandardCharsets;

public class B4Charset {
  static final String NAME = "UTF-8";
  static final String OTHER = "windows-1252";

  void m(String s, byte[] bytes) throws Exception {
    s.getBytes("UTF-8");
    s.getBytes("utf8");
    s.getBytes("ISO-8859-1");
    s.getBytes("latin1");
    s.getBytes("US-ASCII");
    s.getBytes("UTF-16");
    s.getBytes("UTF-16BE");
    s.getBytes("UTF-16LE");
    s.getBytes("windows-1252");
    s.getBytes("bogus");
    s.getBytes(NAME);
    s.getBytes(OTHER);
    s.getBytes("UTF" + "-8");
    s.getBytes(s);
    s.getBytes(StandardCharsets.UTF_8);
    new String(bytes, "UTF-8");
    new String(bytes, "nonsense");
    new String(bytes, 0, 1, "UTF-8");
    new String(bytes, "unicode");
    new String(bytes);
    "lit".getBytes("UTF-8");
    final String local = "UTF-8";
    s.getBytes(local);
    s.getBytes(s.isEmpty() ? "UTF-8" : "UTF-8");
  }

  @SuppressWarnings("StringCharset")
  void s(String s) throws Exception {
    s.getBytes("UTF-8");
  }
}
