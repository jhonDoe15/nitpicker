package b17;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 char c; byte y; short s; float f; void set(char a, byte b2, short d, float e) { c = a; y = b2; s = d; f = e; } int get() { return c + y + s + (int) f; } }
