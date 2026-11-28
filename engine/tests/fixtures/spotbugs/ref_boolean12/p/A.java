package p;
public class A extends q.Base {
    static Boolean sf;
    static final Boolean SK = Boolean.TRUE;
    Boolean f;
    class In {
        boolean n1(Boolean a) { return sf == a; }
        boolean n2(Boolean a) { return a == sf; }
        boolean n3(Boolean a) { return f == a; }
        boolean n4(Boolean a) { return a == SK; }
        boolean n5(Boolean a) { return ps == a; }
        boolean n6(Boolean a) { return pub == a; }
        boolean n7(Boolean a) { return A.this.pub == a; }
        boolean n8(Boolean a) { return A.this.f == a; }
        boolean n9(Boolean a) { return A.sf == a; }
    }
    static class SN {
        boolean n1(Boolean a) { return sf == a; }
        boolean n2(Boolean a) { return ps == a; }
    }
    boolean o1(Boolean a) { return pub == a; }
    boolean o2(Boolean a) { return ps == a; }
    boolean o3(Boolean a) { return pr == Boolean.TRUE; }
    boolean o4(Boolean a) { return fin == Boolean.TRUE; }
    boolean o5(Boolean a) { return a == fin; }
    boolean o6(Boolean a) { return super.pub == Boolean.TRUE; }
    boolean o7(Boolean a) { return this.fin == Boolean.TRUE; }
    boolean o8(Boolean a) { return pub == Boolean.TRUE; }
    boolean o9(Boolean a, q.Base b) { return b.pub == Boolean.TRUE; }
}
