package c10;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m; java.util.concurrent.ConcurrentHashMap<String, String> n;
 void a(String k) {
  m.get(k);
  n.put(k, k);
 }
}
