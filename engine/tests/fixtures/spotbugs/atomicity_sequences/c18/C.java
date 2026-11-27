package c18;
class C {
 java.util.concurrent.ConcurrentHashMap<String, String> m;
 void a(String k) {
  if (m.get(k) == null)
   m.put(k,
     k);
 }
}
