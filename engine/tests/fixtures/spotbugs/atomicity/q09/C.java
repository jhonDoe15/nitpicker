package q09;
class C {
 java.util.concurrent.locks.Lock m;
 void s() {
  m.unlock();
 }
 int x;
 void a() {
  x = 1;
 }
 int get() {
  return x;
 }
}
