package r18;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
static int x;
static { x = 0; }
void a() {
 x = 1;
}
static int get() {
 return x;
}
}
