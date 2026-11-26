package p;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public class Named {
    private final Map<String, String> stored = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, String> declared = new ConcurrentHashMap<>();

    void onStored() {
        synchronized (stored) {
            stored.clear();
        }
    }

    void onDeclared() {
        synchronized (declared) {
            declared.clear();
        }
    }

    static class Kept {
        private final Map<String, String> stored = new ConcurrentHashMap<>();

        void onStored() {
            synchronized (stored) {
                stored.clear();
            }
        }
    }
}
