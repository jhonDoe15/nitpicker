package e02;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  while (m.get(k) == null) {
   m.put(k, k);
  }
 }
}
