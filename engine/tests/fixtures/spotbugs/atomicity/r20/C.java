package r20;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
int x;
void a() {
 x = 1;
}
void b() {
 Runnable r = () -> System.out.println(x);
}
}
