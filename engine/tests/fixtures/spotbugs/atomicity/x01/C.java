package x01;
class C { java.util.concurrent.atomic.AtomicBoolean b; int x; void set(int v) { x = v; } int snap() { int t = x; return t; } }
