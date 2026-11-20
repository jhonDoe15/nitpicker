package p;
import java.util.*;
public class B {
    private Date date; public Date pub; protected Date prot; Date pkg; private static Date sdate; private Object obj; private String s; private List<String> list; private int[] arr; private Date[] dates;
    private Number num; private Date d2; private final Date fd;
    public B(Date date, List<String> list) { this.date = date; this.list = list; fd = date; }
    B(Date date) { this.date = date; fd = null; }
    protected B(Date date, int x) { this.date = date; fd = null; }
    private B(Date date, long x) { this.date = date; fd = null; }
    public void setDate(Date date) { this.date = date; }
    public void setPub(Date date) { this.pub = date; }
    public void setProt(Date date) { this.prot = date; }
    public void setPkg(Date date) { this.pkg = date; }
    public void setNoThis(Date d) { date = d; }
    public static void setSdate(Date d) { sdate = d; }
    public void instSetsStatic(Date d) { sdate = d; }
    protected void protSet(Date d) { date = d; }
    void pkgSet(Date d) { date = d; }
    private void privSet(Date d) { date = d; }
    public void setObj(Date d) { obj = d; }
    public void setObj2(Object o) { obj = o; }
    public void setS(String v) { s = v; }
    public void setArr(int[] a) { arr = a; }
    public void setVar(Date... a) { dates = a; }
    public void viaLocal(Date d) { Date x = d; date = x; }
    public void reassigned(Date d) { d = new Date(); date = d; }
    public void cloned(Date d) { date = (Date) d.clone(); }
    public void copied(List<String> l) { list = new ArrayList<>(l); }
    public void ternary(Date d) { date = d != null ? d : new Date(); }
    public void ternary2(Date d) { date = d == null ? null : d; }
    public void requireNonNull(Date d) { date = Objects.requireNonNull(d); }
    public void ifNull(Date d) { if (d == null) { throw new IllegalArgumentException(); } date = d; }
    public void cast(Object o) { date = (Date) o; }
    public void castNum(Object o) { num = (Number) o; }
    public void other(B b, Date d) { b.date = d; }
    public void chain(Date d) { date = d2 = d; }
    public void fromField(B b) { date = b.date; }
    public void fromGetter(B b) { date = b.getD(); }
    public void lambda(Date d) { Runnable r = () -> { date = d; }; r.run(); }
    public void inner(final Date d) { new Object() { void f() { date = d; } }; }
    public B withDate(Date d) { this.date = d; return this; }
    public void setTwice(Date d) { this.date = d; this.d2 = d; }
    public void cond(Date d, boolean c) { if (c) this.date = d; }
    public void loop(Date d) { for (int i = 0; i < 2; i++) { this.date = d; } }
    public void tryc(Date d) { try { this.date = d; } catch (RuntimeException e) { } }
    public void multi(Date d)
    {
        this.date =
            d;
    }
    public Date getD() { return null; }
    static class PkgClass { private Date date; public void setDate(Date d) { date = d; } public Date getDate() { return date; } }
    private static class PrivClass { private Date date; public void setDate(Date d) { date = d; } public Date getDate() { return date; } }
    protected static class ProtClass { private Date date; public void setDate(Date d) { date = d; } public Date getDate() { return date; } }
    public class Inner { private Date date; public void setDate(Date d) { date = d; } public Date getDate() { return date; } public Date outer() { return B.this.date; } public void setOuter(Date d) { B.this.date = d; } }
    public interface I { Date get(); }
    public I anon() { return new I() { public Date get() { return date; } }; }
    public I lam() { return () -> date; }
    public enum En { X; private Date date; public void setDate(Date d) { date = d; } public Date getDate() { return date; } }
    public record R(Date date, List<String> list, String s) { }
    public record R2(Date date) { public R2 { Objects.requireNonNull(date); } }
    public record R3(Date date) { public R3(Date date) { this.date = date; } public Date date() { return date; } }
    public record R4(int[] a) { public R4 { a = a.clone(); } public int[] a() { return a.clone(); } }
}
