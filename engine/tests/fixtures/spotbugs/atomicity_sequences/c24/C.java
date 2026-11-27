package c24;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m; C o;
 void a(String k) {
  if (o.m.get(k) == null) {
   o.m.put(k, k);
  }
 }
}
