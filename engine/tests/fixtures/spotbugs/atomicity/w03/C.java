package w03;
class C {
 java.util.Map<String,String> m = java.util.Collections.synchronizedMap(new java.util.HashMap<>());
 int x;
 void a() {
  x = 1;
 }
 int get() {
  return x;
 }
}
