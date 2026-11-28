package g03;
class C {
 int x; String s;
 void setX(int v) {
  x = v;
 }
 synchronized int getX() {
  return x;
 }
}
