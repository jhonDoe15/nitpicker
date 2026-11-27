package p;
import java.util.*;
import java.util.function.*;
interface Dflt { default void dm() {} static void sm() {} }
class Base { int bf; void bm() {} static void bs() {} }
public class N extends ArrayList<String> implements Dflt {
    int fld;
    void l1() { Runnable r = () -> { int fld = 1; fld = fld; size(); }; }
    void l2() { Runnable r = () -> { int fld = 1; fld = fld; dm(); }; }
    void l3() { Runnable r = () -> { int fld = 1; fld = fld; Dflt.sm(); }; }
    void l4() { Runnable r = () -> { int fld = 1; fld = fld; modCount++; }; }
    class In {
        int ifld;
        void om() {}
        void x() { Runnable r = () -> { int ifld = 1; ifld = ifld; fld++; }; }
        void y() { Runnable r = () -> { int ifld = 1; ifld = ifld; l1(); }; }
        void z() { Runnable r = () -> { int ifld = 1; ifld = ifld; N.this.l1(); }; }
        void w() { Runnable r = () -> { int ifld = 1; ifld = ifld; om(); }; }
        void v() { Runnable r = () -> { int ifld = 1; ifld = ifld; Object o = N.super.toString(); }; }
        void u() { Runnable r = () -> { int ifld = 1; ifld = ifld; Object o = ifld; }; }
    }
    static class SI {
        int sif;
        void a() { Runnable r = () -> { int sif = 1; sif = sif; Object o = this; }; }
    }
    void l5() { Runnable r = () -> { int fld = 1; fld = fld; Object o = N.class; }; }
    void l6() { Runnable r = () -> { int fld = 1; fld = fld; assert fld > 0; }; }
    void l7() { Runnable r = () -> { int fld = 1; fld = fld; String s = "a" + this; }; }
    void l8() { Runnable r = () -> { int fld = 1; fld = fld; for (String s : this) { } }; }
    void l9() { Runnable r = () -> { int fld = 1; fld = fld; Object o = switch (fld) { default -> 1; }; }; }
    void l10() { Runnable r = () -> { int fld = 1; fld = fld; Runnable q = () -> { Object o = this; }; }; }
    void l11() { Runnable r = () -> { int fld = 1; fld = fld; Object o = new Object() { }; }; }
    void l12() { Runnable r = () -> { int fld = 1; fld = fld; Object o = new Base(); }; }
    void l13() { Runnable r = () -> { int fld = 1; fld = fld; Base.bs(); }; }
    void l14() { Runnable r = () -> { int fld = 1; fld = fld; Object o = super.hashCode(); }; }
    void l15() { Runnable r = () -> { int fld = 1; fld = fld; Supplier<Object> o = super::hashCode; }; }
    void l16() { Runnable r = () -> { int fld = 1; fld = fld; Object o = N.super.hashCode(); }; }
    void l17() { Runnable r = () -> { int fld = 1; fld = fld; Object o = Dflt.super.getClass(); }; }
    enum En { A { void m() { Runnable r = () -> { int ef = 1; ef = ef; evt(); }; } }; int ef; void evt() {} }
    void l18() { Runnable r = () -> { int fld = 1; fld = fld; Object o = (Supplier<Object>) N::new; }; }
    void l19() { Runnable r = () -> { int fld = 1; fld = fld; Object o = (Function<N,Object>) N::hashCode; }; }
    void l20() { Runnable r = () -> { int fld = 1; fld = fld; Object o = (Supplier<Object>) this::hashCode; }; }
    void l21() { Runnable r = () -> { int fld = 1; fld = fld; Object o = (Supplier<Object>) In::new; }; }
    void l22() { Runnable r = () -> { int fld = 1; fld = fld; Object o = this.new In(); }; }
}
