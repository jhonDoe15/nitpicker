package c08;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  m.get(k);
  m.remove(k);
 }
}
