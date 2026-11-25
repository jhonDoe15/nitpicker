package p;
import java.util.*;
public class H {
    private static final H INSTANCE = new H(); private static H lazy; private H next; private static final Sub SUB = new Sub(); private static final Other OTHER = new Other();
    private static final Date EPOCH = new Date(0); private static Date sdate = new Date(); private static final Iterator<Object> IT = Collections.emptyIterator();
    static final Object[] NO_OBJECTS = new Object[0]; static Object[] nonFinalEmpty = new Object[0]; static final Object[] ONE = new Object[1]; private final Object[] instEmpty = new Object[0];
    private static final List<Boolean> L1 = Collections.unmodifiableList(Arrays.asList(Boolean.FALSE, Boolean.TRUE));
    private static final List<Boolean> L2 = Collections.unmodifiableList(new ArrayList<>());
    private static final List<Boolean> L3 = Collections.unmodifiableList(make());
    private static final List<Boolean> L4 = List.of(Boolean.TRUE);
    private static final List<Boolean> L5 = Collections.unmodifiableList(new ArrayList<>(Arrays.asList(Boolean.FALSE)));
    private final List<Boolean> i1 = Collections.unmodifiableList(Arrays.asList(Boolean.FALSE, Boolean.TRUE));
    private final List<Boolean> i3 = Collections.unmodifiableList(make());
    private final List<Boolean> i4; private final List<Boolean> i5; private Date date; private Date d2;
    public H() { List<Boolean> tmp = new ArrayList<>(); i4 = Collections.unmodifiableList(tmp); List<Boolean> t2 = List.of(); i5 = t2; }
    public void setX(int x) { }
    private static List<Boolean> make() { return new ArrayList<>(); }
    public static H getInstance() { return INSTANCE; }
    public static H getLazy() { if (lazy == null) { lazy = new H(); } return lazy; }
    public H getNext() { return next; }
    public H instGetInstance() { return INSTANCE; }
    public static Sub getSub() { return SUB; }
    public static Other getOther() { return OTHER; }
    public static Date epoch() { return EPOCH; }
    public static Date sdate() { return sdate; }
    public static Iterator<Object> it() { return IT; }
    @SuppressWarnings("unchecked") public static <T> Iterator<T> itCast() { return (Iterator<T>) IT; }
    public static Object[] none() { return NO_OBJECTS; }
    public static Object[] nonFinal() { return nonFinalEmpty; }
    public static Object[] one() { return ONE; }
    public Object[] instEmpty() { return instEmpty; }
    public static List<Boolean> l1() { return L1; }
    public static List<Boolean> l2() { return L2; }
    public static List<Boolean> l3() { return L3; }
    public static List<Boolean> l4() { return L4; }
    public static List<Boolean> l5() { return L5; }
    public List<Boolean> i1() { return i1; }
    public List<Boolean> i3() { return i3; }
    public List<Boolean> i4() { return i4; }
    public List<Boolean> i5() { return i5; }
    public Date twice(boolean c) {
        if (c) {
            return date;
        }
        return date;
    }
    public void storeTwice(Date a, Date b, boolean c) {
        if (c) {
            date = a;
        } else {
            date = b;
        }
        d2 = a;
    }
    public void nextStore(Date d) { next.date = d; }
    public void rn(Date d) { date = com.google.common.base.Preconditions.checkNotNull(d, "x"); }
    public static class Sub extends H { }
    public static class Other { public void setY(int y) { } public Object[] viaOuter() { return NO_OBJECTS; } public Object[] viaOuterOne() { return ONE; } }
    public class In { private Date own; public In() { System.gc(); } public In(Date d) { own = d; } public In(int i) { this(); } public void use() { setX(1); } }
    protected class In2 { public In2() { } public H outer() { return H.this; } }
    public class In3 implements java.io.Serializable { public In3() { } }
    public class In4 { public In4() { setX(2); } }
    public class In5 { int v = next == null ? 0 : 1; public In5() { } }
    public class In6 { public In6() { } public Runnable r() { return () -> setX(1); } }
    public class In7 { public In7() { } public Object mk() { return new In2(); } }
    public class In8 { { setX(1); } public In8() { } }
}
class Top { public static Object[] viaOther() { return H.NO_OBJECTS; } }
