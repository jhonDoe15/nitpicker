package c06;
class C {
 
 void a(String k) {
  java.util.concurrent.ConcurrentHashMap<String, String> m = new java.util.concurrent.ConcurrentHashMap<>();
  if (!m.containsKey(k)) {
   m.put(k, k);
  }
 }
}
