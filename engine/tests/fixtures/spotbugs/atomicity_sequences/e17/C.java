package e17;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  if (m.isEmpty()) {
   m.put(k, k);
  }
 }
}
