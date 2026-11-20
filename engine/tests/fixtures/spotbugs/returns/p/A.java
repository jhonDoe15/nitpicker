package p;
import java.util.*;
public class A {
    private Date date; protected Date prot; public Date pub; Date pkg; private static Date sdate; private static int[] sarr;
    private String s; private int[] arr; private List<String> list; private Map<String,String> map; private Object obj; private Holder holder; private Imm imm; private Iface iface; private E e;
    private Fluent fluent; private StringBuilder sb; private java.io.File file; private java.time.Instant instant; private Optional<String> opt; private Collection<String> coll; private Thread thread;
    private Set<String> set; private Iterator<String> it; private Runnable run; private Sub sub; private IfaceSub ifaceSub; private Class<?> k; private Integer boxed; private Calendar cal;
    public Date getDate() { return date; }
    public Date getProt() { return prot; }
    public Date getPub() { return pub; }
    public Date getPkg() { return pkg; }
    protected Date protGetter() { return date; }
    Date pkgGetter() { return date; }
    private Date privGetter() { return date; }
    public static Date getSdate() { return sdate; }
    public static int[] getSarr() { return sarr; }
    public Date instGetsStatic() { return sdate; }
    public String getS() { return s; }
    public int[] getArr() { return arr; }
    public List<String> getList() { return list; }
    public Map<String,String> getMap() { return map; }
    public Object getObj() { return obj; }
    public Holder getHolder() { return holder; }
    public Imm getImm() { return imm; }
    public Iface getIface() { return iface; }
    public E getE() { return e; }
    public Fluent getFluent() { return fluent; }
    public StringBuilder getSb() { return sb; }
    public java.io.File getFile() { return file; }
    public java.time.Instant getInstant() { return instant; }
    public Optional<String> getOpt() { return opt; }
    public Collection<String> getColl() { return coll; }
    public Thread getThread() { return thread; }
    public Set<String> getSet() { return set; }
    public Iterator<String> getIt() { return it; }
    public Runnable getRun() { return run; }
    public Sub getSub() { return sub; }
    public IfaceSub getIfaceSub() { return ifaceSub; }
    public Class<?> getK() { return k; }
    public Integer getBoxed() { return boxed; }
    public Calendar getCal() { return cal; }
    public Date viaLocal() { Date d = date; return d; }
    public Date viaThis() { return this.date; }
    public Date viaClone() { return (Date) date.clone(); }
    public int[] arrClone() { return arr.clone(); }
    public List<String> unmod() { return Collections.unmodifiableList(list); }
    public Date ternary(boolean b) { return b ? date : null; }
    public Date ternary2(boolean b) { return b ? null : date; }
    public Date ifElse(boolean b) { if (b) { return date; } return null; }
    public Object asObject() { return date; }
    public Date other(A a) { return a.date; }
    public Date cast() { return (Date) obj; }
    public Date paren() { return (date); }
    public synchronized Date sync() { return date; }
    public final Date fin() { return date; }
    public Date viaLocal2() { Date d = null; if (s != null) d = date; return d; }
    public Date nullCheck() { if (date == null) return null; return date; }
    public Date lazy() { if (date == null) date = new Date(); return date; }
    public Date fresh() { date = new Date(); return date; }
    public Date assignInReturn() { return date = new Date(); }
    public static class Holder { public int v; public void setV(int x) { v = x; } }
    public static final class Imm { private final int v; public Imm(int v) { this.v = v; } public int v() { return v; } }
    public interface Iface { void setX(int x); }
    public interface IfaceSub extends Iface { int get(); }
    public static class Sub extends Holder { }
    public enum E { X; int q; public void setQ(int q) { this.q = q; } }
    public static class Fluent { public Fluent setX(int x) { return new Fluent(); } public Fluent withY() { return this; } }
}
