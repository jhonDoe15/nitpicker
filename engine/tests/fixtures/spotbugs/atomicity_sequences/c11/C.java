package c11;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 synchronized void a(String k) {
  if (m.get(k) == null) {
   m.put(k, k);
  }
 }
}
