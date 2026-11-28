package p;

public interface I1 {
    I1 A = Impl1.INSTANCE;
    I1 B = new Impl1();
    int C = Impl1.NUM;
    I1 D = Nested.INSTANCE;
    I1 E = new Nested();
    String F = Impl1.name();
    class Nested implements I1 {
        public static final I1 INSTANCE = new Nested();
    }
}
