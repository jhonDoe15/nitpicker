package p;
import java.util.*;
public class F {
    private Date date; private F next; private G g; private Nested nested; private Date[] many; private Date second;
    public void setX(int x) { }
    public Date viaNext() { return next.date; }
    public Date viaG() { return g.gd; }
    public Date viaNested() { return nested.nd; }
    public Date viaParamG(G x) { return x.gd; }
    public Date viaLocalG() { G x = new G(); return x.gd; }
    public Date viaLocalF() { F x = new F(); return x.date; }
    public Date viaThisLocal() { F x = this; return x.date; }
    public Date viaCall() { return self().date; }
    public F self() { return this; }
    public void varargsOther(Date d, String... rest) { date = d; }
    public void varargsOther2(String s, Date... rest) { many = rest; }
    public void twoStores(Date a, Date b) { date = a; second = b; }
    public void rn2(Date d) { date = Objects.requireNonNull(d, "msg"); }
    public void rn3(Date d) { date = Objects.requireNonNullElse(d, new Date()); }
    public void rn4(Date d) { Objects.requireNonNull(d); date = d; }
    public void opt(Date d) { date = Optional.ofNullable(d).orElse(null); }
    public static class Nested { Date nd; private Date pd; public void setY(int y) { } public Date outerOfNested(F f) { return f.date; } }
    public class In { public Date viaOuterNext() { return next.date; } public Date viaOuterNested() { return nested.pd; } public Date direct() { return date; } }
    private final List<String> a1 = Arrays.asList("a"); private final List<String> a2 = Collections.singletonList("a"); private final List<String> a3 = List.copyOf(new ArrayList<>());
    private final Map<String,String> a4 = Collections.emptyMap(); private final List<String> a5 = java.util.stream.Stream.of("a").toList(); private final Set<String> a6 = Collections.unmodifiableSet(new HashSet<>());
    private final int[] a7 = {}; private final int[] a8 = {1}; private final int[] a9 = new int[0]; private final int[] a10 = new int[1]; private final List<String> a11 = null; private List<String> a12;
    private final Collection<String> a13 = Collections.unmodifiableCollection(new ArrayList<>()); private final SortedMap<String,String> a14 = Collections.unmodifiableSortedMap(new TreeMap<>());
    private final List<String> a15 = Collections.synchronizedList(new ArrayList<>()); private final Set<String> a16 = Collections.singleton("x"); private final List<String> a17 = Collections.nCopies(1, "x");
    private List<String> a18 = new ArrayList<>(); private final Map<String,String> a19 = Map.copyOf(new HashMap<>()); private final Map<String,String> a20 = Map.ofEntries(); private final Set<String> a21 = Collections.emptySet();
    private List<String> a22; private List<String> a23;
    public void late() { a18 = Collections.unmodifiableList(a18); a22 = List.of(); a23 = cond() ? List.of() : new ArrayList<>(); }
    private boolean cond() { return true; }
    public List<String> g1() { return a1; }
    public List<String> g2() { return a2; }
    public List<String> g3() { return a3; }
    public Map<String,String> g4() { return a4; }
    public List<String> g5() { return a5; }
    public Set<String> g6() { return a6; }
    public int[] g7() { return a7; }
    public int[] g8() { return a8; }
    public int[] g9() { return a9; }
    public int[] g10() { return a10; }
    public List<String> g11() { return a11; }
    public List<String> g12() { return a12; }
    public Collection<String> g13() { return a13; }
    public SortedMap<String,String> g14() { return a14; }
    public List<String> g15() { return a15; }
    public Set<String> g16() { return a16; }
    public List<String> g17() { return a17; }
    public List<String> g18() { return a18; }
    public Map<String,String> g19() { return a19; }
    public Map<String,String> g20() { return a20; }
    public Set<String> g21() { return a21; }
    public List<String> g22() { return a22; }
    public List<String> g23() { return a23; }
}
class G { Date gd; public void setZ(int z) { } }
