package g05;
class C {
 int x; String s;
 synchronized void setFoo(int v) {
  x = v;
 }
 int getFoo() {
  return x;
 }
}
