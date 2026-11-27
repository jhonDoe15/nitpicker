package l07;
class C extends java.util.concurrent.locks.ReentrantLock {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 void a() {
  lock();
  x = 1;
  unlock();
 }
 int get() {
  return x;
 }
}
