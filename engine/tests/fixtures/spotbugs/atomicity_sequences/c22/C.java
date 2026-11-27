package c22;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  if (m.get(k) == null) {
   m.put(k, k);
  }
  if (m.get(k + 1) == null) {
   m.put(k, k);
  }
 }
}
