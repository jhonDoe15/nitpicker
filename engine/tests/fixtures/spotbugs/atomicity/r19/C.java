package r19;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
int x;
void a() {
 Runnable r = () -> {
  x = 1;
 };
}
int get() {
 return x;
}
}
