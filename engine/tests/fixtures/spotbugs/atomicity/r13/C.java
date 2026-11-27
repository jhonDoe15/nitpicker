package r13;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
int x;
void a(int v) {
 x = v * 2 + x;
}
int get() {
 return x;
}
}
