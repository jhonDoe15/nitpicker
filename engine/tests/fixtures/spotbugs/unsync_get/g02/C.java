package g02;
class C {
 int x; String s;
 synchronized void setX(int v) {
  x = v;
 }
 synchronized int getX() {
  return x;
 }
}
