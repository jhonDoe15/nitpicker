package p;
import java.util.*;
import java.util.function.Supplier;
public class C<T extends Date, U> extends q.Base {
    private Date date; private Holder holder; private Sub sub; private T tv; private U uv; private Object o; private Iface iface; private Date[] dates; private Map.Entry<String, Date> entry;
    private final List<String> unmod; private final List<String> listOf; private final List<String> fresh; private List<String> mixed; private final List<String> inline = new ArrayList<>();
    private final List<String> inlineUnmod = Collections.unmodifiableList(new ArrayList<>()); private final List<String> empty = Collections.emptyList(); private final Set<String> setOf = Set.of("a");
    private static final String[] EMPTY = {}; private static final int[] ZERO = new int[0]; private static final List<String> SLIST = new ArrayList<>(); private static final List<String> SUNMOD = Collections.unmodifiableList(new ArrayList<>());
    private volatile Date vol; private transient Date tr; private final Map<String, String> mapOf = Map.of();
    public C(List<String> a) { unmod = Collections.unmodifiableList(a); listOf = List.of("x"); fresh = new ArrayList<>(a); mixed = Collections.unmodifiableList(a); }
    public void reset() { mixed = new ArrayList<>(); }
    public List<String> getUnmod() { return unmod; }
    public List<String> getListOf() { return listOf; }
    public List<String> getFresh() { return fresh; }
    public List<String> getMixed() { return mixed; }
    public List<String> getInline() { return inline; }
    public List<String> getInlineUnmod() { return inlineUnmod; }
    public List<String> getEmpty() { return empty; }
    public Set<String> getSetOf() { return setOf; }
    public Map<String, String> getMapOf() { return mapOf; }
    public static String[] empty() { return EMPTY; }
    public static int[] zero() { return ZERO; }
    public static List<String> slist() { return SLIST; }
    public static List<String> sunmod() { return SUNMOD; }
    public Date getVol() { return vol; }
    public Date getTr() { return tr; }
    public Date fieldOfField() { return holder.inner; }
    public static Date staticParam(C<?, ?> c) { return c.date; }
    public Sub castField() { return (Sub) holder; }
    public Holder upcast() { return sub; }
    public T getTv() { return tv; }
    public U getUv() { return uv; }
    public Date getInherited() { return inherited; }
    public Date getPubInherited() { return pubInherited; }
    public Date getSInherited() { return sInherited; }
    public List<String> getNames() { return names; }
    public Date tryFinally() { try { return date; } finally { System.gc(); } }
    public Date sync() { synchronized (this) { return date; } }
    public Date sw(int i) { switch (i) { case 1: return date; default: return null; } }
    public Date merge1(boolean c) { Date d = date; if (c) d = new Date(); return d; }
    public Date merge2(boolean c) { Date d; if (c) d = date; else d = date; return d; }
    public Date merge3(boolean c) { Date d = date; if (c) { System.gc(); } return d; }
    public Date merge4(boolean c) { Date d = date; if (c) { d = vol; } return d; }
    public Date loopRet() { Date d = date; for (int i = 0; i < 3; i++) { System.gc(); } return d; }
    public Date elem() { return dates[0]; }
    public Date[] getDates() { return dates; }
    public Date
        multiLine() {
        return
            date;
    }
    public Supplier<Date> sup() { return () -> date; }
    public Map.Entry<String, Date> getEntry() { return entry; }
    public void setEntry(Map.Entry<String, Date> e, Date[] many, String[]... nested) { entry = e; }
    public void setIface(ImmImpl x) { iface = x; }
    public void setO(Date[] a) { o = a; }
    public void local(Date d) { C<?, ?> c = new C<>(null); c.date = d; }
    public void viaField(Date d) { holder.inner = d; }
    public static void staticStoreInst(C<?, ?> c, Date d) { c.date = d; }
    public void merged(Date d) { if (d == null) d = new Date(); date = d; }
    public void checked(Date d) { date = com.google.common.base.Preconditions.checkNotNull(d); }
    public void ident(Date d) { date = id(d); }
    public void setInherited(Date d) { inherited = d; }
    public void setSInherited(Date d) { sInherited = d; }
    public void setTv(T t) { tv = t; }
    public void twoParams(Date a, Date b, boolean c) { Date x = c ? a : b; date = x; }
    public void twoParams2(Date a, Date b, boolean c) { Date x; if (c) x = a; else x = b; date = x; }
    private static <X> X id(X x) { return x; }
    public static class Holder { Date inner; public void setV(int x) { } }
    public static class Sub extends Holder { }
    public interface Iface { void setX(int x); }
    public static final class ImmImpl implements Iface { public void setX(int x) { } }
}
class Pkg { public static class PubInPkg { private Date d; public Date get() { return d; } public void set(Date x) { d = x; } public PubInPkg(Date x) { d = x; } } private java.util.Date d; public java.util.Date get() { return d; } }
