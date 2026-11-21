package p;
import java.util.*;
import static java.util.Collections.unmodifiableSet;
import static java.util.Collections.emptySet;
public record R(String a, Inner in, Kind kind, List<String> list, Date when) {
    public enum Kind { A, B }
    public static final class Inner { void setX(int x) {} }
    public interface Api {
        record N1(Date d, long[] points) implements Api {}
        record N2(Set<String> s) { public N2 { s = Set.copyOf(s); } }
        record N3(Set<String> s) { public N3 { Objects.requireNonNull(s); } }
        record N4(List<String> s) { public N4 { s = new ArrayList<>(s); } }
        record N5(List<String> s) { public N5 { if (s == null) { s = List.of(); } } }
    }
    public static class Host {
        record P1(Date d) {}
        public record P2(Date d) {}
        protected record P3(Date d) {}
        private record P4(Date d) {}
    }
    public static class V {
        private String[] names; private Date[] dates; private Set<String> s1; private Set<String> s2; private Date taken; private Date d2; private List<String> l1; private List<String> l2;
        public V(String... names) { this.names = Objects.requireNonNull(names); }
        public void v2(Date... dates) { this.dates = dates; }
        public void v3(String... names) { String[] x = names; this.names = x; }
        public void v4(String... names) { this.names = (String[]) names; }
        public void i1(Set<String> s) { s1 = unmodifiableSet(s); }
        public Set<String> g1() { return s1; }
        public void i2(boolean c, Set<String> s) { if (c) { s2 = unmodifiableSet(s); } else { s2 = emptySet(); } }
        public Set<String> g2() { return s2; }
        public void st(Date d) { taken = d; }
        public Date take() { Date t = taken; taken = null; return t; }
        public Date take2() { Date t = taken; d2 = null; return t; }
        public Date take3() { Date t = taken; taken = new Date(); return t; }
        public Date take4(V o) { Date t = taken; o.taken = null; return t; }
        public void i3(List<String> l) { l1 = l == null ? List.of() : List.copyOf(l); }
        public List<String> g3() { return l1; }
        public void i4(List<String> l) { l2 = l != null ? Collections.unmodifiableList(l) : null; }
        public List<String> g4() { return l2; }
    }
}
