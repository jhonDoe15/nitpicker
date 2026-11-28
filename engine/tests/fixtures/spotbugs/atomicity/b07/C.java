package b07;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 int x; void set(int v) { x = v; } private int get() { return x; } void use() { System.out.println(get()); } }
