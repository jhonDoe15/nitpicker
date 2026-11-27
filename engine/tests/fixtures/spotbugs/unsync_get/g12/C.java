package g12;
class C {
 int x; String s;
 synchronized void setX(int v) {
  x = v;
 }
 private int getX() {
  return x;
 }
 int u() { return getX(); }
}
