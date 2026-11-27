package e09;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  if (m.containsKey(k)) {
   m.put(k, k + 1);
  }
 }
}
