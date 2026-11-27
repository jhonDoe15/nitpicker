package c03;
class C {
 java.util.Map<String, String> m = new java.util.concurrent.ConcurrentHashMap<>();
 void a(String k) {
  if (!m.containsKey(k)) {
   m.put(k, k);
  }
 }
}
