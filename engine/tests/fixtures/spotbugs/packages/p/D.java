package p;
import java.util.Date;
import java.util.List;
public class D {
    private int x;
    public void setX(int x) { this.x = x; }
    public class UsesOuter { public int f() { return x; } }
    public class NoOuter { public int f() { return 1; } }
    public class Explicit {
        public Explicit(int a) {
            System.out.println(x);
        }
    }
    protected class Prot { public int f() { return x; } }
    class PkgInner { public int f() { return x; } }
    @Deprecated
    public
    record Rec(
        Date date,
        List<String> list) {
    }
    @Deprecated
    public record Rec2(Date date) {
        public Rec2 {
            java.util.Objects.requireNonNull(date);
        }
    }
    public record Rec3(Date date, int n) {
        public Rec3(Date date) {
            this(date, 1);
        }
    }
    record PkgRec(Date date) { }
    private record PrivRec(Date date) { }
}
