package e04;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k, boolean b) {
  if (m.get(k) == null) {
   if (b) {
    m.put(k, k);
   }
  }
 }
}
