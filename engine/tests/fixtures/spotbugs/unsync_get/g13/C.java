package g13;
class C {
 int x; String s;
 synchronized void setX(int v) {
  x = v;
 }
 int getX() {
  synchronized (this) {
   return x;
  }
 }
}
