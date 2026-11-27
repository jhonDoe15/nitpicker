package b14;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 int x; Runnable r = () -> { x = 3; }; int get() { return x; } }
