package w05;
class C {
 java.util.Map<String,String> m = java.util.Collections.unmodifiableMap(new java.util.HashMap<>());
 int x;
 void a() {
  x = 1;
 }
 int get() {
  return x;
 }
}
