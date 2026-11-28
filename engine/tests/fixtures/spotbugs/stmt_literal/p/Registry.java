package p;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

class Registry {
    private final Map<String, String> stored = new ConcurrentHashMap<>();

    Class<?> named() {
        return Named.class;
    }

    void onStored() {
        assert stored != null;
        synchronized (stored) {
            stored.clear();
        }
    }
}
