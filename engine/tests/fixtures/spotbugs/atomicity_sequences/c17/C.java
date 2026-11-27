package c17;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  m.get(k);
 }
 void b(String k) {
  m.put(k, k);
 }
}
