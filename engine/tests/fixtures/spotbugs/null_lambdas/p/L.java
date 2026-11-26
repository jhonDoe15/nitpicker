package p;
import java.util.List;
import java.util.function.Function;
import java.util.function.Supplier;
public class L {
    Resp f;
    static void use(Object o) { System.out.println(o); }
    void l1(List<Resp> all) {
        all.forEach(r -> {
            Resp s = new Resp();
            if (s != null) { use(1); } else { use(2); }
        });
    }
    void l2(List<Resp> all) {
        all.forEach(r -> {
            r.ok();
            if (r != null) { use(1); } else { use(2); }
        });
    }
    Function<Resp, Object> l3() {
        return r -> {
            if (r == null) { return null; }
            Supplier<Object> in = () -> {
                Resp t = new Resp();
                t.ok();
                return t != null ? t : "x";
            };
            return r != null ? r : in;
        };
    }
    final Supplier<Resp> l4 = () -> {
        Resp q = null;
        if (q == null) { use(q); }
        return q;
    };
    void l5(List<Resp> all) {
        all.forEach(r -> {
            Resp s = null;
            s.ok();
            Object o = null;
            use(o.hashCode());
        });
    }
    void l6(List<Resp> all) {
        all.forEach(r -> use(new Object() {
            void x() { Resp s = new Resp(); if (s != null) { use(1); } else { use(2); } }
        }));
    }
}
