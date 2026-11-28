package p;
import java.util.*;
public class N3 {
  static class MyMap3 extends HashMap<String, String> { }
  static class MyT { public void setProperty(String k, String v) { } }
  void q1(LinkedHashMap<String, String> p) { p.put("password", "x"); }
  void q2(MyMap3 p) { p.put("password", "x"); }
  void q3(WeakHashMap<String, String> p) { p.put("password", "x"); }
  void q4(Map<String, String> p) { p.replace("password", "x"); }
  void q5(Map<String, String> p) { p.getOrDefault("password", "x"); }
  void q6() { Map.of("password", "x"); }
  void q7(Properties p) { p.putIfAbsent("password", "x"); }
  void q8(Map<String, String> p) { p.put("PASSWD", "x"); }
  void q9(Map<String, String> p) { p.put("passwordx", ""); }
  void q10(Map<String, String> p, String s) { p.put("password", s + "x"); }
  void q11(SortedMap<String, String> p) { p.put("password", "x"); }
  void q12(AbstractMap<String, String> p) { p.put("password", "x"); }
  void q13(Map<String, String> p) { p.put("password", null); }
  void q14(Map<String, String> p) { p.put(null, "x"); }
  void q15(Map<String, byte[]> p) { p.put("password", new byte[] {1}); }
  void q16(Map<String, String> p) { p.put("a.Pwd.b", "x"); }
  void q17(Map<String, Object> p) { p.put("password", new java.math.BigInteger("1")); }
}
