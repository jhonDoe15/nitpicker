package r01;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
int x;
static void set(int v, C o) {
 o.x = v;
}
int get() {
 return x;
}
}
