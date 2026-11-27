package p;
public class A {
    Boolean f, g;
    static Boolean n() { return null; }
    boolean u1(Boolean a, Boolean b, Boolean c) {
        boolean x = a == b;
        boolean y = a == c;
        return x && y;
    }
    boolean u2(Boolean a, Boolean b) {
        boolean x = a == b;
        boolean y = b == a;
        return x && y;
    }
    boolean u3(Boolean a, Boolean b) {
        boolean x = a == b;
        boolean y = a == f;
        return x && y;
    }
    boolean u4(Boolean a) {
        boolean x = f == g;
        boolean y = g == f;
        boolean z = f == f;
        return x && y;
    }
    boolean u5(Boolean a, Boolean b) {
        boolean x = n() == a;
        boolean y = n() == b;
        boolean z = f == a;
        return x && y;
    }
    boolean u6(Boolean a, Boolean b) {
        boolean x = a == b;
        boolean y = a != b;
        boolean z = a == Boolean.TRUE;
        boolean w = a == Boolean.FALSE;
        return x && y;
    }
    boolean u7(Boolean a) { return a == (Boolean) null; }
    boolean u8(Boolean a) { return (Boolean) null == a; }
    boolean u9(Object o, Boolean a) { return a == (Object) o; }
}
