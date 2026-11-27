package r11;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
int x;
void a() {
 x = x > 0 ? 1 : 2;
}
int get() {
 return x;
}
}
