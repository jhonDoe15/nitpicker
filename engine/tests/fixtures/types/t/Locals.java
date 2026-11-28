package t;
import java.util.function.Supplier;
class Locals {
    boolean local() {
        class Local { class Member {} }
        Local x = new Local(), y = new Local();
        Local.Member m = x.new Member();
        Object o = m;
        return x == y || new Local[0] == new Local[1] || m == x.new Member() || o == m;
    }
    boolean record() {
        record R(int a) {}
        R x = new R(1), y = new R(2);
        return x == y;
    }
    boolean anonymous() {
        Object o = new Object() {};
        Supplier<String> s = new Supplier<>() { public String get() { return ""; } };
        return o == new Object() {} || s == null;
    }
    boolean called() {
        class Local { String name() { return ""; } }
        Local l = new Local();
        Object o = l;
        return l.hashCode() == o.hashCode() || new Local().name().isEmpty();
    }
}
