package e15;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  if (m.get(k) != null) {
   return;
  }
  m.put(k, k);
 }
}
