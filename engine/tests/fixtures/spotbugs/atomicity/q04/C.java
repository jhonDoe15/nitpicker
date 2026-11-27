package q04;
class C {
 int x;
 void s() {
  Runnable r = () -> {
   synchronized (this) {
   }
  };
 }
 void a() {
  x = 1;
 }
 int get() {
  return x;
 }
}
