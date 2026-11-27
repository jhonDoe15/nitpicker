package t08;
class C { 
 ThreadLocal<String> t = new ThreadLocal<>(); int x; void set(int v) { x = v; } int get() { return x; } }
