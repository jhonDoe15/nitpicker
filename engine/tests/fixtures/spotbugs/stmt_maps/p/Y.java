package p;
import java.util.*;
import java.util.concurrent.*;
public class Y {
    int x;
    static class T2 extends TreeMap<String, Integer> {}
    static class E2 extends EnumMap<Thread.State, Integer> { E2() { super(Thread.State.class); } }
    static class C2 extends ConcurrentHashMap<String, Integer> {}
    static class S2 extends ConcurrentSkipListMap<String, Integer> {}
    void j1(T2 m) { for (String k : m.keySet()) { x += m.get(k); } }
    void j2(E2 m) { for (Thread.State k : m.keySet()) { x += m.get(k); } }
    void j3(C2 m) { for (String k : m.keySet()) { x += m.get(k); } }
    void j4(S2 m) { for (String k : m.keySet()) { x += m.get(k); } }
    void j5(Map<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } for (String k : m.keySet()) { x -= m.get(k); } }
    void j6(Map<String, Integer> m) {
        for (String k : m.keySet()) {
            if (x > 0) {
                x += m.get(k);
            }
        }
    }
    void j7(Map<String, Map<String, Integer>> m) { for (String k : m.keySet()) { for (String j : m.get(k).keySet()) { x += m.get(k).get(j); } } }
    void j8(Map<String, Integer> m) { for (String k : m.keySet()) { x += k.length(); } }
    void j9(Map<String, Integer> m) { for (String k : m.keySet()) { String key = k; x += m.get(k); } }
}
