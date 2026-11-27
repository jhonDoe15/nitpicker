package p;

import java.io.Serializable;
import java.lang.annotation.*;
import java.util.function.Supplier;

public class C {
    private static final long serialVersionUID = 1L;
    @Retention(RetentionPolicy.RUNTIME) @interface Run {}
    @Retention(RetentionPolicy.CLASS) @interface Cls {}
    @Retention(RetentionPolicy.SOURCE) @interface Src {}
    @Deprecated private int a1;
    @Run private int a2;
    @Cls private int a3;
    @Src private int a4;
    private int b1;
    private int b2;
    private int b3;
    private int b4;
    private int b5;
    private int b6;
    private int b7;
    private int b8;
    private Object b9;
    private int b10;
    private int b11;
    private int[] b12;
    private int b13;

    C() {
        a1 = 1; a2 = 1; a3 = 1; a4 = 1;
        b1 = 1; b2 = 1; b3 = 1; b4 = 1; b5 = 1; b6 = 1; b7 = 1; b8 = 1; b9 = null; b10 = 1; b11 = 1;
        b12 = new int[2];
        b13 = 1;
    }
    Supplier<Integer> s1() { return () -> b1; }
    class Inner { int g() { return b2; } }
    static class Nested { int g(C c) { return c.b3; } }
    Object anon() { return new Object() { public String toString() { return "" + b4; } }; }
    void asrt() { assert b5 > 0; }
    int sub(D d) { return ((C) d).b6; }
    int self(C o) { o.b7 = o.b7; return 0; }
    void str() { System.out.println(b8 + ""); }
    void sync() { synchronized (this) { b9 = null; } }
    void cmp() { b10 = b10 + 0; }
    void ari() { b12[0] = 1; }
    int mr() { java.util.function.IntSupplier f = this::get13; return 0; }
    int get13() { return b13; }
    static class D extends C {}
}
