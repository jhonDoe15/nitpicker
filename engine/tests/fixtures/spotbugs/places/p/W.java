package p;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

public class W {
    private final Map<String, String> fieldMap = new HashMap<>();
    private static final Map<String, String> STATIC_MAP = new HashMap<>();
    private final ConcurrentHashMap<String, String> chm = new ConcurrentHashMap<>();
    private static final Lock STATIC_LOCK = new ReentrantLock();

    static {
        for (String k : STATIC_MAP.keySet()) { System.out.println(STATIC_MAP.get(k)); }
    }
    void a() {
        for (String k : fieldMap.keySet()) { System.out.println(fieldMap.get(k)); }
    }
    void b(Map<String, String> m) {
        for (String k : m.keySet()) { System.out.println(m.get(k)); }
    }
    void c() {
        Map<String, String> local = new HashMap<>();
        for (String k : local.keySet()) { System.out.println(local.get(k)); }
    }
    void d(Lock lock) {
        synchronized (lock) { System.out.println(1); }
    }
    void e() {
        synchronized (chm) { System.out.println(2); }
    }
    void f(ConcurrentHashMap<String, String> m) {
        synchronized (m) { System.out.println(3); }
    }
    void g() {
        synchronized (STATIC_LOCK) { System.out.println(4); }
    }
    Lock make() { return new ReentrantLock(); }
    void h() {
        synchronized (make()) { System.out.println(5); }
    }
    void i() {
        Runnable r = () -> {
            try { System.out.println(fieldMap.size()); } catch (NullPointerException e) { }
        };
        r.run();
    }
}
