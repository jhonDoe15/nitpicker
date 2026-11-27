package r16;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
int x;
void a() {
 x = 0;
 if (x > 1) { x = 2; }
}
int get() {
 return x;
}
}
