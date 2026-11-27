package k03;
class C {
 java.util.concurrent.locks.ReentrantReadWriteLock.ReadLock l;
 int x;
 void a() {
  x = 1;
 }
 int get() {
  return x;
 }
}
