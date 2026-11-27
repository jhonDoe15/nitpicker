package c23;
class C {
 static java.util.concurrent.ConcurrentHashMap<String, String> m;
 static void a(String k) {
  if (m.get(k) == null) {
   m.put(k, k);
  }
 }
}
