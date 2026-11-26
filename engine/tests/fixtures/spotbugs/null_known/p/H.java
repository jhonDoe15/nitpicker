package p;
import java.util.*;
public class H {
    Object fld;
    Set<String> mk() { return new HashSet<>(); }
    private Set<String> pmk() { return new HashSet<>(); }
    static Set<String> smk() { return new HashSet<>(); }
    Object fget() { return fld; }
    Object cond(boolean b) { return b ? new Object() : "x"; }
    Object viaLocal() { Object o = new Object(); return o; }
    Object str() { return "x"; }
    Object chain() { return mk(); }
    int a1() { Set<String> s = mk(); int n = s == null ? 0 : s.hashCode();
        return s.size() + n; }
    int a2() { Set<String> s = pmk(); int n = s == null ? 0 : s.hashCode();
        return s.size() + n; }
    int a3() { Set<String> s = smk(); int n = s == null ? 0 : s.hashCode();
        return s.size() + n; }
    int a4() { Object s = fget(); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a5(boolean b) { Object s = cond(b); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a6() { Object s = viaLocal(); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a7() { Object s = str(); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a8() { Object s = chain(); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a9() { Object s = Other.make(); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a10() { Object s = String.valueOf(1); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a12() { Object s = new Object(); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a13(Other o) { Object s = o.inst(); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a15() { Object s = Made.make(); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a16(Made m) { Object s = m.inst(); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a17(Made m) { Object s = m.maybe(); int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n; }
    int a18(boolean b) { String s = b ? null : "x"; return Integer.parseInt(s); }
    int a19(boolean b) { String s = b ? null : "x"; return Made.use(s); }
    int a20(boolean b) { String s = b ? null : "x"; return "y".compareTo(s); }
}
class Other {
    static Object make() { return new Object(); }
    Object inst() { return new Object(); }
}
