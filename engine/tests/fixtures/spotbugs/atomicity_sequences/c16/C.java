package c16;
class C {
 java.util.concurrent.ConcurrentSkipListMap<String, String> m;
 void a(String k) {
  if (!m.containsKey(k)) {
   m.put(k, k);
  }
 }
}
