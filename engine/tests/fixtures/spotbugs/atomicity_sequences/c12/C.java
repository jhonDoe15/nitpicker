package c12;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  synchronized (this) {
   if (m.get(k) == null) {
    m.put(k, k);
   }
  }
 }
}
