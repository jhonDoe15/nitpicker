package e13;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  if (m.get(k) == null) {
   Runnable r = () -> m.put(k, k);
  }
 }
}
