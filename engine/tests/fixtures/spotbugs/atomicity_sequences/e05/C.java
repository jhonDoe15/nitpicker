package e05;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  if (m.get(k) == null) {
   System.out.println();
  } else {
   m.put(k, k);
  }
 }
}
