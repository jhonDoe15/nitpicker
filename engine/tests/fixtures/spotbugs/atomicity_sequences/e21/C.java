package e21;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  if (m.get(k) == null) {
   try {
    m.put(k, k);
   } catch (RuntimeException e) {
   }
  }
 }
}
