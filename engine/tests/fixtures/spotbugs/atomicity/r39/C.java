package r39;
class C {
 int x;
 void a() {
  x = 1;
 }
 int get() {
  synchronized (this) {}
  return x;
 }
}
