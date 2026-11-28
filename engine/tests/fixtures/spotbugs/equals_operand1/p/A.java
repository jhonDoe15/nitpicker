package p;
import java.util.*;
public class A {
    String name;
    public boolean equals(Object o) {
        if (o instanceof A) return name.equals(((A) o).name);
        else if (o instanceof String) return name.equals(o);
        return false;
    }
}
class B {
    public boolean equals(Object o) {
        if (o instanceof Number) return true;
        if (o instanceof Object) return true;
        return o instanceof B;
    }
}
class C extends B {
    public boolean equals(Object o) {
        return o instanceof B || o instanceof Runnable;
    }
}
class D implements Runnable {
    public void run() {}
    public boolean equals(Object o) {
        if (o instanceof Runnable) return true;
        if (o instanceof Integer) return false;
        if (o instanceof Integer) return false;
        if (o instanceof String) return false;
        return false;
    }
}
class E {
    public boolean equals(Object o) {
        if (o.getClass() == String.class) return true;
        if (String.class.isInstance(o)) return true;
        return o instanceof E;
    }
}
class Fx {
    public boolean equals(Object o) {
        return o instanceof String s && s.isEmpty();
    }
}
class G {
    public boolean equals(Object o) {
        Object x = o;
        String s = (String) o;
        return x instanceof Integer;
    }
    public boolean equals(G g) { return g == this; }
}
class H {
    public boolean equals(Object o) {
        switch (o) {
            case String s: return true;
            default: return false;
        }
    }
}
final class I {
    public boolean equals(Object o) {
        return o instanceof Cloneable;
    }
}
class J {
    int x;
    public boolean equals(Object o) {
        if (!(o instanceof J)) return false;
        Object y = new Object();
        return y instanceof String;
    }
}
interface K { }
class L {
    public boolean equals(Object o) { return o instanceof K; }
}
class M {
    public boolean equals(Object o) { return o instanceof int[]; }
}
class N {
    public static boolean equals(Object o, int k) { return o instanceof String; }
}
class O {
    public boolean equals(Object o) {
        return new Inner().test(o);
    }
    class Inner { boolean test(Object o) { return o instanceof String; } }
    Runnable r = () -> { Object z = null; boolean b = z instanceof String; };
}
