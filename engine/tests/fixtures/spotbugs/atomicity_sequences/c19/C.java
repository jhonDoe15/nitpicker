package c19;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 String a(String k) {
  String v = m.get(k);
  if (v != null) {
   return v;
  }
  m.put(k, k);
  return k;
 }
}
