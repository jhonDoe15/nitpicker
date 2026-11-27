package r03;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
int x;
void set(int v) {
 C o = this;
 o.x = v;
}
int get() {
 return x;
}
}
