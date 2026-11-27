package p;
import q.Q;
public class A {
    static final Boolean K1 = Boolean.TRUE;
    static final Boolean V1 = Boolean.valueOf(true);
    static final Boolean N1 = null;
    final Boolean I1 = Boolean.TRUE;
    static final Object O1 = Boolean.TRUE;
    boolean a1(Boolean a) { return a == K1; }
    boolean a2(Boolean a) { return a == V1; }
    boolean a3(Boolean a) { return a == N1; }
    boolean a4(Boolean a) { return a == I1; }
    boolean a5(Boolean a) { return a == O1; }
    boolean a6(Object a) { return a == K1; }
    boolean b1(Boolean a) { return a == Q.K; }
    boolean b2(Boolean a) { return a == Q.V; }
    boolean b3(Boolean a) { return a == Q.N; }
    boolean b4(Q q, Boolean a) { return a == q.I; }
    boolean b5(Boolean a) { return a == Q.O; }
    boolean b6(Boolean a) { return a == Q.nf; }
    boolean c1(Boolean a) { return K1 == a; }
    boolean c2(Boolean a) { return Boolean.TRUE == K1; }
    boolean c3(Boolean a) { return K1 == V1; }
    boolean c4(Boolean a) { return Q.K == a; }
}
