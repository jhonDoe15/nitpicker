package p;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class L {
    private volatile int count;
    private final ConcurrentHashMap<String, String> chm = new ConcurrentHashMap<>();
    private final Map<String, String> map = new HashMap<>();

    void a() {
        Runnable r = () -> {
            try { System.out.println(map.size()); } catch (NullPointerException e) { }
        };
        Runnable s = () -> {
            synchronized (chm) { System.out.println(1); }
        };
        Runnable t = () -> count++;
        Runnable u = () -> {
            for (String k : map.keySet()) { System.out.println(map.get(k)); }
        };
        java.util.function.IntUnaryOperator v = x -> {
            int y = 0;
            switch (x) {
                case 1: y = 1;
                case 2: y += 2; break;
            }
            return y;
        };
        r.run(); s.run(); t.run(); u.run(); v.applyAsInt(1);
    }
}
