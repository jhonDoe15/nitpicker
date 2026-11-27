package p;

public class A {
    void main() { System.gc(); }
    void main(String[] a) { System.gc(); }
    static void main(String a) { System.gc(); }
    static void mainx(int q) { System.gc(); }
    static void a1() {}
    int main(int a, int b) { System.gc(); return 0; }
    static class B { public static void main(String[] a) { System.gc(); System.exit(1);} }
    static class C { static int main(String[] a) { System.gc(); System.exit(1); return 0;} }
    static class D { void main(String[] a) { System.gc(); System.exit(1);} }
    static class E { private static void main(String[] a) { System.gc(); System.exit(1);} }
    static class F { void test() { System.gc(); } void Test() { System.gc(); } void testing() { System.gc(); } void atest() { System.gc();} }
    static class G { void exitx() { System.exit(1); } void EXIT() { System.exit(1); } void eXit() { System.exit(1);} void ext() { System.exit(1); } }
    static class H { void gcx() { System.gc(); } void agc() { System.gc();} void a_gc_b() { System.gc();} void GCa() { System.gc(); } void gC() { System.gc(); } void Gc() { System.gc(); } }
    static class I { void m() { System.exit(1); } void n() { Runtime.getRuntime().exit(1); System.exit(1); } }
}
class K { public static void main(String... a) { System.gc(); System.exit(1);} }
