package s;
import javax.naming.directory.*;

public class L {
    boolean unset;
    boolean setFalse = false;
    boolean setTrue = true;
    boolean both = true;
    static boolean sTrue = true;
    static boolean sUnset;
    boolean ctorTrue;
    Boolean boxed = true;
    final boolean fin;
    L() {
        ctorTrue = true;
        fin = true;
    }
    void flip() {
        both = false;
    }
    void a(SearchControls s, L other) {
        s.setReturningObjFlag(unset);
        s.setReturningObjFlag(setFalse);
        s.setReturningObjFlag(setTrue);
        s.setReturningObjFlag(both);
        s.setReturningObjFlag(sTrue);
        s.setReturningObjFlag(sUnset);
        s.setReturningObjFlag(ctorTrue);
        s.setReturningObjFlag(boxed);
        s.setReturningObjFlag(fin);
        s.setReturningObjFlag(other.setTrue);
        s.setReturningObjFlag(Other.T);
        s.setReturningObjFlag(Other.F);
        s.setReturningObjFlag(Boolean.TRUE);
        s.setReturningObjFlag(Boolean.parseBoolean("true"));
        s.setReturningObjFlag(1 > 0);
        s.setReturningObjFlag(s.getReturningObjFlag());
    }
}
class Other {
    static boolean T = true;
    static boolean F = false;
}
