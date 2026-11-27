package e14;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  for (String s : m.keySet()) {
   if (m.get(s) == null) {
    m.put(s, k);
   }
  }
 }
}
