package x06;
class C { java.util.concurrent.atomic.AtomicBoolean b; long x; void set(long v) { x = v; } void snap() { long t = x, u = t; } }
