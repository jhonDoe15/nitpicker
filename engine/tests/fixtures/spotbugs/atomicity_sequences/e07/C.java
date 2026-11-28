package e07;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  String v = m.get(k);
  System.out.println(v);
  m.put(k, k);
 }
}
