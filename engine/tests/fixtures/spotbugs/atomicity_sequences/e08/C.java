package e08;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  boolean has = m.containsKey(k);
  if (!has) {
   m.put(k, k);
  }
 }
}
