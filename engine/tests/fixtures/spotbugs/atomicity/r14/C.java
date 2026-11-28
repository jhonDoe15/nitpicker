package r14;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
long x;
void a(long v) {
 x = x + v;
}
long get() {
 return x;
}
}
