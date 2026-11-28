package c21;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  m.get(k);
  m.computeIfAbsent(k, x -> x);
 }
}
