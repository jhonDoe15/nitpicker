package p;
import java.util.*;
import com.google.common.collect.Lists;
public class W {
    private final List<String> w1 = Collections.unmodifiableList(Arrays.asList());
    private final List<String> w2 = List.copyOf(Arrays.asList("a"));
    private final Set<String> w3 = Collections.unmodifiableSet(new HashSet<>(Arrays.asList("a")));
    private final List<String> w4 = Collections.unmodifiableList(Lists.newArrayList("a"));
    private final List<String> w5; private final List<String> w6; private final List<String> w7; private final List<String> w8; private final Map<String, String> w9;
    private final List<String> w10 = Collections.unmodifiableList(Arrays.asList(new String[] {"a"}));
    private final List<String> w11 = Collections.unmodifiableList(Arrays.asList("a"));
    private final List<String> w12 = Collections.unmodifiableList(Arrays.asList(ARR));
    private final List<String> w13 = Collections.unmodifiableList(new ArrayList<>(Arrays.asList(ARR)));
    private final List<String> w14 = Collections.unmodifiableList(java.util.stream.Stream.of("a").toList());
    private final List<String> w15 = Collections.unmodifiableList(Collections.singletonList("a"));
    private final List<String> w16 = Collections.unmodifiableList(Lists.asList("a", ARR));
    private static final String[] ARR = {"x"};
    public W(String[] in, List<String> p) {
        List<String> t = Arrays.asList("a"); w5 = Collections.unmodifiableList(t);
        w6 = Collections.unmodifiableList(Arrays.asList(in));
        w7 = p == null ? List.of() : Collections.unmodifiableList(p);
        w8 = Collections.unmodifiableList(p.subList(0, 1));
        Map<String, String> m = new HashMap<>(); m.put("a", "b"); w9 = Collections.unmodifiableMap(m);
    }
    public List<String> g1() { return w1; }
    public List<String> g2() { return w2; }
    public Set<String> g3() { return w3; }
    public List<String> g4() { return w4; }
    public List<String> g5() { return w5; }
    public List<String> g6() { return w6; }
    public List<String> g7() { return w7; }
    public List<String> g8() { return w8; }
    public Map<String, String> g9() { return w9; }
    public List<String> g10() { return w10; }
    public List<String> g11() { return w11; }
    public List<String> g12() { return w12; }
    public List<String> g13() { return w13; }
    public List<String> g14() { return w14; }
    public List<String> g15() { return w15; }
    public List<String> g16() { return w16; }
}
