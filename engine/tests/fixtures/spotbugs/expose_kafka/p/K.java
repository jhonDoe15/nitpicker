package p;
import java.util.*;
import java.util.concurrent.*;
public class K {
    public static class AppliedConfig {
        private final Map<String, String> rawConfig;
        private Map<String, String> transformedConfig;
        public AppliedConfig(Map<String, String> rawConfig) {
            this.rawConfig = rawConfig;
        }
        public synchronized Map<String, String> transformedConfig(boolean transform) {
            if (transformedConfig == null) {
                if (transform) {
                    transformedConfig = new HashMap<>();
                } else {
                    transformedConfig = rawConfig;
                }
            }
            return transformedConfig;
        }
    }
    public static class NotParamField {
        private final Map<String, String> local = new HashMap<>();
        private Map<String, String> copy;
        public synchronized void sync() {
            copy = local;
        }
    }
    public static class CompletedFutureField {
        private static final Future<String> COMPLETED = CompletableFuture.completedFuture(null);
        public Future<String> report() {
            return COMPLETED;
        }
    }
    public static class MutableFutureField {
        private static final Future<String> OPEN = new CompletableFuture<>();
        public Future<String> open() {
            return OPEN;
        }
    }
}
