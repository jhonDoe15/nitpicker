package g10;
class C {
 int x; String s;
 synchronized int setX(int v) {
  return x = v;
 }
 int getX() {
  return x;
 }
}
