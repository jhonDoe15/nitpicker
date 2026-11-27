package c04;
class C {
 java.util.concurrent.ConcurrentMap<String, String> m;
 void a(String k) {
  if (!m.containsKey(k)) {
   m.put(k, k);
  }
 }
}
