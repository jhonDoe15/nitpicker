package p;
import java.util.*;
import static q.Q.*;
import q.Q;
public class A extends q.Base {
    Boolean mine;
    boolean m1(Boolean a) { return a == Q.sf; }
    boolean m2(Boolean a) { return a == sf; }
    boolean m3(Boolean a) { return a == get(); }
    boolean m4(Boolean a) { return a == Q.get(); }
    boolean m5(Boolean a) { return a == bf; }
    boolean m6(Boolean a) { return a == bs; }
    boolean m7(Boolean a) { return a == pf; }
    boolean m8(Boolean a, Q q) { return a == q.f; }
    boolean m9(Boolean a) { return a == K; }
    boolean m10(Boolean a) { return a == Q.K; }
    boolean m11(Boolean a) { return Boolean.TRUE == Q.K; }
    boolean m12(Boolean a, Optional<Boolean> o) { return a == o.get(); }
    boolean m13(Boolean a, List<Boolean> o) { return a == o.get(0); }
    boolean m14(Boolean a, Map<String,Boolean> o) { return a == o.get("x"); }
    boolean m15(Boolean a, Object obj) { return a == (Boolean) obj; }
    boolean m16(Boolean a, Object obj) { return obj == (Object) a; }
    boolean m17(Boolean a) { return a == Boolean.valueOf("x"); }
    boolean m18(Boolean a) { return Boolean.valueOf("y") == a; }
    boolean m19(Boolean a) { return Boolean.valueOf(true) == Boolean.valueOf(false); }
    boolean m20(Boolean a) { return this.mine == a; }
    boolean m21(A o, Boolean a) { return o.mine == a; }
    boolean m22(Boolean a) { return a == this.bf; }
    boolean m23(Boolean a) { return a == super.bf; }
    boolean m24(Boolean a) { return (Boolean) null == a; }
}
