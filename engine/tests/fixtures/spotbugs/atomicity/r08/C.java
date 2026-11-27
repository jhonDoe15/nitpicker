package r08;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
int x; int y;
void a() {
 x = y + x;
}
int get() {
 return x;
}
}
