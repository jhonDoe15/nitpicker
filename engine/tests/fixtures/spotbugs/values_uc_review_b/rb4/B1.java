package rb4;
import java.util.*;
public class B1 {
 int f; Object keep;
 void poke() { f = 4; }
 void m0() { if (f > 3) { return; } new Thread(); if (f > 3) { System.out.println("x"); } }
 void m1() { if (f > 3) { return; } keep = new java.util.HashMap<String,String>(); if (f > 3) { System.out.println("x"); } }
 void m2() { if (f > 3) { return; } new java.io.File("a"); if (f > 3) { System.out.println("x"); } }
 void m3() { if (f > 3) { return; } new String("a"); if (f > 3) { System.out.println("x"); } }
 void m4() { if (f > 3) { return; } keep = new Integer(3); if (f > 3) { System.out.println("x"); } }
 void m5() { if (f > 3) { return; } new java.util.Random(); if (f > 3) { System.out.println("x"); } }
 void m6() { if (f > 3) { return; } new java.io.ByteArrayOutputStream(); if (f > 3) { System.out.println("x"); } }
 void m7() { if (f > 3) { return; } new java.util.concurrent.atomic.AtomicInteger(); if (f > 3) { System.out.println("x"); } }
 void m8() { if (f > 3) { return; } new java.util.Scanner(System.in); if (f > 3) { System.out.println("x"); } }
 void m9() { if (f > 3) { return; } new java.util.Date(); if (f > 3) { System.out.println("x"); } }
 void m10() { if (f > 3) { return; } new java.lang.ThreadLocal<String>(); if (f > 3) { System.out.println("x"); } }
 void m11() { if (f > 3) { return; } new java.util.concurrent.locks.ReentrantLock(); if (f > 3) { System.out.println("x"); } }
 void m12() { if (f > 3) { return; } new java.lang.Exception(); if (f > 3) { System.out.println("x"); } }
 void m13() { if (f > 3) { return; } new java.io.IOException(); if (f > 3) { System.out.println("x"); } }
 void m14() { if (f > 3) { return; } new java.lang.Error(); if (f > 3) { System.out.println("x"); } }
 void m15() { if (f > 3) { return; } Thread.currentThread(); if (f > 3) { System.out.println("x"); } }
 void m16() { if (f > 3) { return; } System.currentTimeMillis(); if (f > 3) { System.out.println("x"); } }
 void m17() { if (f > 3) { return; } Math.max(1,2); if (f > 3) { System.out.println("x"); } }
 void m18() { if (f > 3) { return; } "a".length(); if (f > 3) { System.out.println("x"); } }
 void m19() { if (f > 3) { return; } "abc".equals("b"); if (f > 3) { System.out.println("x"); } }
 void m20() { if (f > 3) { return; } String.valueOf(3); if (f > 3) { System.out.println("x"); } }
 void m21() { if (f > 3) { return; } Integer.valueOf(3); if (f > 3) { System.out.println("x"); } }
 void m22() { if (f > 3) { return; } keep = Objects.hash(1); if (f > 3) { System.out.println("x"); } }
 void m23() { if (f > 3) { return; } new java.util.ArrayList<String>().size(); if (f > 3) { System.out.println("x"); } }
 void m24() { if (f > 3) { return; } System.out.println(); if (f > 3) { System.out.println("x"); } }
}
