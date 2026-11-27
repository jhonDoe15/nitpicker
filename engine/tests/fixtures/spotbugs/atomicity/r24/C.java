package r24;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
int x;
void a() {
 x = 1;
}
int get() {
 return x;
}
int ctorRead() { return 0; }
C() { System.out.println(x); }
}
