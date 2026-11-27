package q11;
class C {
 void s(Object o) {
  synchronized (o) {}
 }
 int x;
 void a() {
  x = 1;
 }
 int get() {
  return x;
 }
}
