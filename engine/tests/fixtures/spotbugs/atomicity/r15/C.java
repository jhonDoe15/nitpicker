package r15;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
int x;
void a() {
 x = 0;
}
int get() {
 return x;
}
void b() {
 x += 1;
}
}
