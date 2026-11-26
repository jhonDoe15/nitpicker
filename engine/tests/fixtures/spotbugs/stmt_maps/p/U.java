package p;
import java.util.*;
import java.util.concurrent.*;
public class U {
    int x;
    interface MyMap<K, V> extends Map<K, V> {}
    interface MySorted<K, V> extends SortedMap<K, V> {}
    SortedMap<String, Integer> sf = new TreeMap<>();
    EnumMap<Thread.State, Integer> ef = new EnumMap<>(Thread.State.class);
    void i1(TreeMap<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void i2() { for (String k : sf.keySet()) { x += sf.get(k); } }
    void i3() { for (Thread.State k : ef.keySet()) { x += ef.get(k); } }
    void i4(ConcurrentNavigableMap<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void i5(MyMap<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void i6(MySorted<String, Integer> m) { for (String k : m.keySet()) { x += m.get(k); } }
    void i7(Map<Thread.State, Integer> m) { for (Thread.State k : m.keySet()) { x += m.get(k); } }
    void i8(SortedMap<String, Integer> m) { for (String k : m.keySet()) { Integer v = m.get(k); x += v; } }
    void i9(SortedMap<String, Integer> m) { Set<String> s = m.keySet(); for (String k : s) { x += m.get(k); } }
    void i10(SortedMap<String, Integer> m) { Iterator<String> it = m.keySet().iterator(); while (it.hasNext()) { x += m.get(it.next()); } }
}
