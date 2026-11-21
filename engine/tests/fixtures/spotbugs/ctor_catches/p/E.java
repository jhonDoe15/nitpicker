package p;
import java.io.*;
public class E {
    public static class Base { public Base() { } public Base(int a) { } }
    public static class E1 { public E1() { try { own(); } catch (RuntimeException e) { } } void own() { throw new IllegalStateException(); } }
    public static class E2 { public E2() { a(); } void a() { try { b(); } catch (RuntimeException e) { } } void b() { throw new IllegalStateException(); } }
    public static class E3 { public E3() { try { own(); } catch (Exception e) { } } void own() { throw new IllegalStateException(); } }
    public static class E4 { public E4() { a(); } void a() { try { b(); } catch (Exception e) { } } void b() throws IOException { } }
    public static class E5 { public E5(String s) { a(s); } void a(String s) { try { Integer.parseInt(s); } catch (NumberFormatException e) { } } }
    public static class E6 { public E6() { a(); } void a() { try { b(); } catch (Throwable e) { } } void b() { throw new IllegalStateException(); } }
    public static class E7 extends Base { public E7() { super(make()); } static int make() { throw new IllegalStateException(); } }
    public static class E8 extends Base { public E8(String s) { super(Integer.parseInt(s)); } }
    public static class E9 { public E9() { this(make()); } public E9(int a) { } static int make() { throw new IllegalStateException(); } }
    public static class E10 { public E10(String s) { this(Integer.parseInt(s)); } public E10(int a) { } }
    public static class E11 extends Base { public E11() { this(1); } private E11(int a) { super(make()); } static int make() { throw new IllegalStateException(); } }
    public static class E12 { public E12() { this(1); } public E12(int a) { this(a, a); } public E12(int a, int b) { throw new IllegalStateException(); } }
    public static class E13 { Runnable r; public E13() { b(); } void b() { r = () -> { throw new IllegalStateException(); }; } }
    public static class E14 { public E14() { try { throw new IllegalStateException(); } catch (IllegalStateException e) { System.out.println(); } finally { System.out.println(); } } }
    public static class E15 { public E15() { a(); } void a() { try { throw new IllegalArgumentException(); } catch (IllegalStateException e) { } } }
    public static class E16 { public E16() { a(); } void a() { for (int i = 0; i < 2; i++) { try { b(); } catch (IllegalArgumentException e) { } catch (Exception e) { } } } void b() { throw new IllegalArgumentException(); } }
    public static class E17 { public E17() { a(); } void a() { try { b(); } catch (IllegalStateException e) { } } void b() { throw new IllegalStateException(); } }
    public static class E18 { public E18() { try { own(); } catch (IllegalStateException e) { } } void own() { throw new IllegalStateException(); } }
    public static class E19 { public E19() { try { own(); } catch (IllegalArgumentException e) { } } void own() { throw new IllegalStateException(); } }
    public static class E20 { public E20() { a(); } void a() { try { b(); } finally { System.out.println(); } } void b() { } }
    public static class E21 extends Base { public E21(Object o) { super(o.hashCode()); if (o == null) { throw new IllegalStateException(); } } }
    public static class E22 { public E22() { a(); } void a() { try { b(); } catch (RuntimeException e) { System.out.println(); } } void b() { c(); } void c() { throw new IllegalStateException(); } }
}
