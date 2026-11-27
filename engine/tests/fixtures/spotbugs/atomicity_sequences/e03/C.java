package e03;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 String a(String k) {
  return m.get(k) == null ? m.put(k, k) : k;
 }
}
