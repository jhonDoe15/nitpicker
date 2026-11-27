package rb3;
import java.util.*;
public class B1 {
    int f; Object keep;
    void poke() { f = 4; }
    void a() { if (f > 3) { return; } keep = new ArrayList<String>(); if (f > 3) { System.out.println("x"); } }
    void b() { if (f > 3) { return; } keep = new StringBuilder("a"); if (f > 3) { System.out.println("x"); } }
    void c() { if (f > 3) { return; } new Object(); if (f > 3) { System.out.println("x"); } }
    void d() { if (f > 3) { return; } new Thread(); if (f > 3) { System.out.println("x"); } }
    void e() { if (f > 3) { return; } new Other(); if (f > 3) { System.out.println("x"); } }
    void g() { if (f > 3) { return; } new Sub(); if (f > 3) { System.out.println("x"); } }
    void h() { if (f > 3) { return; } new RuntimeException("a"); if (f > 3) { System.out.println("x"); } }
    void i() { if (f > 3) { return; } new int[3].clone(); if (f > 3) { System.out.println("x"); } }
    void j() { if (f > 3) { return; } int[] a = new int[3]; a[0] = 1; if (f > 3) { System.out.println("x"); } }
    void k() { if (f > 3) { return; } Object o = new Object() { void z() {} }; if (f > 3) { System.out.println("x"); } }
    void l() { if (f > 3) { return; } keep = E.A.name(); if (f > 3) { System.out.println("x"); } }
    void m() { if (f > 3) { return; } keep = E.A.ordinal(); if (f > 3) { System.out.println("x"); } }
    void n() { if (f > 3) { return; } E.valueOf("A"); if (f > 3) { System.out.println("x"); } }
}
class Other { Other() { } }
class Base { Base() { } }
class Sub extends Base { Sub() { super(); } }
enum E { A }
