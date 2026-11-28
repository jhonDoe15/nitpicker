package e19;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  if (m.getOrDefault(k, "") == null) {
   m.put(k, k);
  }
 }
}
