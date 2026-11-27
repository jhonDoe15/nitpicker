package c05;
class C {
 
 void a(java.util.concurrent.ConcurrentHashMap<String, String> m, String k) {
  if (!m.containsKey(k)) {
   m.put(k, k);
  }
 }
}
