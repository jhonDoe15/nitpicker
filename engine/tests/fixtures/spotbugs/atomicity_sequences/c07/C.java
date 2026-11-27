package c07;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  m.put(k, k);
  m.get(k);
 }
}
