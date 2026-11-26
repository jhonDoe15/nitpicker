package p;
import java.util.*;
public class N {
    Map<String, Integer> map = new HashMap<>();
    int x;
    Map<String, Integer> getMap() { return map; }
    void g1() {
        for (String k : map.keySet()) { x += map.get(k); }
        for (String k : map.keySet()) { x += map.get(k); }
    }
    void g2() {
        for (String k : map.keySet()) {
            x += map.get(k);
            x += map.get(k);
        }
    }
    void g3() {
        for (String k : map.keySet()) {
            x += map
                .get(
                    k);
        }
    }
    void g4() { for (String k : getMap().keySet()) { x += getMap().get(k); } }
    void g5() { Map<String, Integer> m = map; for (String k : m.keySet()) { x += m.get(k); } }
    void g6() { Map<String, Integer> m = map; for (String k : map.keySet()) { x += m.get(k); } }
    void g7(N o) { for (String k : o.map.keySet()) { x += o.map.get(k); } }
    void g8() {
        for (String k
                : map.keySet()) {
            x += map.get(k);
        }
    }
    void g9() { for (String k : map.keySet()) { if (k.isEmpty()) continue; x += map.get(k); } }
    void g10() { for (String k : map.keySet()) { x += k.length(); } x += map.get("a"); }
    void g11(SortedMap<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void g12(EnumMap<Thread.State, Integer> m) { for (Thread.State k : m.keySet()) { x += m.get(k); } }
    void g13(Hashtable<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void g14(LinkedHashMap<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void g15(Map<String, Integer> m) { for (String k : m.keySet()) { Integer v = m.get(k); m.remove(k); x += v; } }
    void g16(Map<String, Integer> m) { Iterator<String> it = m.keySet().iterator(); String k = it.next(); x += m.get(k); }
    void g17(Map<String, Integer> m) { for (String k : m.keySet()) { k = k.trim(); x += m.get(k); } }
}
