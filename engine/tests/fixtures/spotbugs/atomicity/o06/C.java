package o06;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 int x; void dec() { System.out.println(x++); } int get() { return x; } }
