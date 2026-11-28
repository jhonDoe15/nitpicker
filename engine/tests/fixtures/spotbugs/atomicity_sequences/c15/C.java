package c15;
class C {
 java.util.Map<String, String> m = java.util.Collections.synchronizedMap(new java.util.HashMap<>());
 void a(String k) {
  if (!m.containsKey(k)) {
   m.put(k, k);
  }
 }
}
