package p;
public class A extends Base {
    final Boolean fin;
    Boolean nf;
    static final Object MARK = Boolean.FALSE;
    static Object mark2 = Boolean.TRUE;
    A(Boolean b) { fin = b; }
    boolean m1() { return fin == Boolean.TRUE; }
    boolean m2() { return inh == Boolean.TRUE; }
    boolean m3() { return inhNf == Boolean.TRUE; }
    boolean m4() { return nf == Boolean.TRUE; }
    boolean m5(Object o) { return o == MARK; }
    boolean m6(Object o) { return o == mark2; }
    boolean m7() { return Boolean.TRUE == fin; }
    boolean m8(A other) { return other.fin == Boolean.TRUE; }
}
class Base {
    protected final Boolean inh = null;
    protected Boolean inhNf;
}
