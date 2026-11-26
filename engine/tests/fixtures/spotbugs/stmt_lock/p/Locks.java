package p;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

public class Locks {
    private final Map<String, String> stored = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, String> declared;
    private Map<String, String> twoKinds = new ConcurrentHashMap<>();
    private final Lock lock = new ReentrantLock();
    private final AtomicInteger counter = new AtomicInteger();
    private final Object plain = new Object();
    private static final Map<String, String> SHARED = new ConcurrentSkipListMap<>();

    public Locks(ConcurrentMap<String, String> declared) {
        this.declared = declared;
    }

    void reset() {
        twoKinds = new java.util.HashMap<>();
    }

    void onStored() {
        synchronized (stored) {
            stored.clear();
        }
    }

    void onDeclared() {
        synchronized (declared) {
            stored.clear();
        }
    }

    void onTwoKinds() {
        synchronized (twoKinds) {
            stored.clear();
        }
    }

    void onLock() {
        synchronized (lock) {
            stored.clear();
        }
    }

    void onCounter() {
        synchronized (counter) {
            stored.clear();
        }
    }

    void onPlain() {
        synchronized (plain) {
            stored.clear();
        }
    }

    static void onShared() {
        synchronized (SHARED) {
            SHARED.clear();
        }
    }

    void onParameter(ConcurrentMap<String, String> given) {
        synchronized (given) {
            stored.clear();
        }
    }

    <T extends ConcurrentMap<String, String>> void onTypeVariable(T given) {
        synchronized (given) {
            stored.clear();
        }
    }

    void onLocal() {
        Map<String, String> local = new ConcurrentHashMap<>();
        synchronized (local) {
            stored.clear();
        }
    }

    void onBranches(boolean first) {
        Map<String, String> local;
        if (first) {
            local = new ConcurrentHashMap<>();
        } else {
            local = new ConcurrentSkipListMap<>();
        }
        synchronized (local) {
            stored.clear();
        }
    }

    void onReassigned() {
        Map<String, String> local = new java.util.HashMap<>();
        local = new ConcurrentHashMap<>();
        synchronized (local) {
            stored.clear();
        }
    }

    void onCaught() {
        try {
            stored.clear();
        } catch (java.util.concurrent.CompletionException e) {
            synchronized (e) {
                stored.clear();
            }
        }
    }

    void onThis() {
        synchronized (this) {
            stored.clear();
        }
    }

    static class OwnLock extends ReentrantLock {
        void onSelf() {
            synchronized (this) {
                lock();
            }
        }
    }
}
