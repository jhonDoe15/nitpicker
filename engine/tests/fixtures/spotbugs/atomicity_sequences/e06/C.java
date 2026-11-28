package e06;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 java.util.concurrent.ConcurrentHashMap<String, String> g() { return m; }
 void a(String k) {
  if (g().get(k) == null) {
   g().put(k, k);
  }
 }
}
