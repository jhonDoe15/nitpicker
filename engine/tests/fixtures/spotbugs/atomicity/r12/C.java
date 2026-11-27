package r12;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
int x;
void a(int v) {
 x = x + v * 2;
}
int get() {
 return x;
}
}
