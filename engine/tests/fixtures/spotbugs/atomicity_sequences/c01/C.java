package c01;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m = new java.util.concurrent.ConcurrentHashMap<>();
 String a(String k) {
  String v = m.get(k);
  if (v == null) {
   v = k;
   m.put(k, v);
  }
  return v;
 }
}
