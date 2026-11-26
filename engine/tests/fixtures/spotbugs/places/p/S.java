package p;

import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.locks.ReentrantLock;

public class S {
    private volatile int count;
    private final ReentrantLock lock = new ReentrantLock();

    int a(String s) {
        try {
            return s.length();
        } catch (NullPointerException e) {
            return 0;
        }
    }
    void b() {
        synchronized (lock) { count++; }
    }
    int c() { return new Random().nextInt(); }
    void d(Map<String, String> m) {
        for (String k : m.keySet()) { System.out.println(m.get(k)); }
    }
    int e(int x) {
        int y = 0;
        switch (x) {
            case 1: y = 1;
            case 2: y += 2; break;
        }
        return y;
    }
}
