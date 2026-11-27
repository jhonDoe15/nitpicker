package e01;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k, boolean b) {
  if (b && m.get(k) == null) {
   m.put(k, k);
  }
 }
}
