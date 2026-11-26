package p;

import java.util.concurrent.locks.ReentrantLock;
import lombok.AccessLevel;
import lombok.Data;
import lombok.Getter;
import lombok.Setter;
import lombok.experimental.Accessors;

public class Named {
    @Getter
    public enum Kind {
        ONE;
        private final ReentrantLock lock = new ReentrantLock();
    }

    @Data
    @Accessors(chain = true)
    public static class Chained {
        private ReentrantLock lock = new ReentrantLock();
        private int size;
    }

    @Getter
    @Accessors(fluent = true)
    public static class Fluent {
        private final ReentrantLock lock = new ReentrantLock();
    }

    @Getter
    @Accessors(prefix = {"m", "f_"})
    public static class Prefixed {
        private final ReentrantLock mLock = new ReentrantLock();
        private final ReentrantLock f_gate = new ReentrantLock();
        private final ReentrantLock plain = new ReentrantLock();
    }

    public static class Levels {
        @Getter(AccessLevel.PROTECTED) private final ReentrantLock guarded = new ReentrantLock();
        @Setter(AccessLevel.PRIVATE) @Getter private ReentrantLock hidden;
        public ReentrantLock getlock() { return guarded; }
        @Getter private ReentrantLock lock;
    }

    void use(Kind kind, Chained chained, Fluent fluent, Prefixed prefixed, Levels levels) {
        synchronized (kind.getLock()) { }
        synchronized (chained.setSize(1).getLock()) { }
        synchronized (fluent.lock()) { }
        synchronized (prefixed.getLock()) { }
        synchronized (prefixed.getGate()) { }
        synchronized (levels.getGuarded()) { }
        synchronized (levels.getHidden()) { }
    }
}
