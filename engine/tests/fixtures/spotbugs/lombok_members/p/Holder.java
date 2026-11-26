package p;

import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.ConcurrentHashMap;
import lombok.Data;
import lombok.Getter;
import lombok.Value;

@Getter
public class Holder {
    private final ReentrantLock lock = new ReentrantLock();
    private final ConcurrentHashMap<String, String> cache = new ConcurrentHashMap<>();
    private boolean open;
    private boolean isShut;
    private static final ReentrantLock SHARED = new ReentrantLock();

    @Data
    public static class Box {
        private ReentrantLock inner;
        private final ConcurrentHashMap<String, Integer> counts = new ConcurrentHashMap<>();
    }

    @Value
    public static class Frozen {
        ReentrantLock frozen;
    }

    public static class Plain {
        @Getter private ReentrantLock own = new ReentrantLock();
        @Getter(lombok.AccessLevel.NONE) private ReentrantLock hidden = new ReentrantLock();
        public ReentrantLock getHidden() { return hidden; }
    }
}
