package a.b;
import java.util.List;
@SuppressWarnings("x")
public class Tokens<T extends List<List<String>>> {
	int x = 1 >> 2 >>> 3; long y = 0x1FL; double d = 1.5e3; char c = 'A'; String s = "a\tb";
    Tokens() { super(); Class<?> k = String.class; x >>= 1; x >>>= 2; }
    String t = """
        hi A
        """;
    // CPD-OFF
    void off() {}
    // CPD-ON
    @Foo(a = 1) @Bar void m(int... a) { m(1, 2); var q = (Runnable) () -> {}; }
    enum E { X; E() {} }
}
