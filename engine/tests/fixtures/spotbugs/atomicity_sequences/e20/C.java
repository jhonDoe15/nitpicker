package e20;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  if (m.containsValue(k)) {
   m.put(k, k);
  }
 }
}
