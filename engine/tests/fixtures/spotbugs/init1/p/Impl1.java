package p;

class Impl1 implements I1 {
    static final Impl1 INSTANCE = new Impl1();
    static final int NUM = 4;
    static String name() { return "x"; }
}
