package p;
import com.google.errorprone.annotations.CanIgnoreReturnValue;
public class A {
    static int x = 1;
    static Object d = null;
    void nothing() {}
    static void nothingStatic() {}
    int pure(int a) { return a + 1; }
    @CanIgnoreReturnValue int marked(int a) { return a + 1; }
    static Object descriptor() { return d; }
    static { descriptor(); }
    void use() {
        nothing();
        nothingStatic();
        pure(1);
        marked(2);
    }
    private static final int y = pure2(3);
    static int pure2(int a) { return a * 2; }
}
@CanIgnoreReturnValue
class B {
    int pure(int a) { return a + 1; }
    void use() { pure(3); }
}
