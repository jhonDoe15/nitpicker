package p;
public class A {
    public int lamFirst;
    public int ctorAndMethod;
    public int initAndMethod = 1;
    public static int clinitAndMethod = 1;
    public int helper;
    public int viaSuper;
    public int inLocal;
    public int both;
    public A() { ctorAndMethod = 1; init(); }
    private void init() { helper = 1; }
    void s1() {
        Runnable q = () -> lamFirst = 1;
        q.run();
    }
    void s2() { lamFirst = 2; ctorAndMethod = 2; initAndMethod = 2; clinitAndMethod = 2; }
    void s3() { class L { void w() { inLocal = 1; } } new L().w(); }
    void s4() { both = 1; }
    A(int x) { both = x; }
}
class H extends A {
    void s() { viaSuper = 1; lamFirst = 3; }
}
class K {
    public int k;
    {
        k = 1;
    }
    void m() {
        k
          = 2;
    }
}
