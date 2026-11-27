package e11;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k, java.util.concurrent.ConcurrentHashMap<String, String> n) {
  if (m.get(k) == null) {
   n.put(k, k);
  }
 }
}
