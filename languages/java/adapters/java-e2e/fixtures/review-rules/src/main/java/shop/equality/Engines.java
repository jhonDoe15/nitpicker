package shop.equality;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public final class Engines {
    private Engines() {
    }

    public static final class EngineConfig {
        private final String shardId;
        private final String clusterService;
        private final String mapperService;
        private final String committerFactory;
        private final String transferTracker;

        private EngineConfig(Builder builder) {
            this.shardId = builder.shardId;
            this.clusterService = builder.clusterService;
            this.mapperService = builder.mapperService;
            this.committerFactory = builder.committerFactory;
            this.transferTracker = builder.transferTracker;
        }

        public Builder toBuilder() { // violation: CopyMethodDropsField
            return new Builder()
                .shardId(this.shardId)
                .clusterService(this.clusterService)
                .mapperService(this.mapperService)
                .committerFactory(this.committerFactory);
        }

        public Builder fullBuilder() {
            return new Builder()
                .shardId(this.shardId)
                .clusterService(this.clusterService)
                .mapperService(this.mapperService)
                .committerFactory(this.committerFactory)
                .transferTracker(this.transferTracker);
        }

        public static final class Builder {
            private String shardId;
            private String clusterService;
            private String mapperService;
            private String committerFactory;
            private String transferTracker;

            public Builder shardId(String value) {
                this.shardId = value;
                return this;
            }

            public Builder clusterService(String value) {
                this.clusterService = value;
                return this;
            }

            public Builder mapperService(String value) {
                this.mapperService = value;
                return this;
            }

            public Builder committerFactory(String value) {
                this.committerFactory = value;
                return this;
            }

            public Builder transferTracker(String value) {
                this.transferTracker = value;
                return this;
            }

            public EngineConfig build() {
                return new EngineConfig(this);
            }
        }
    }

    public static final class CircuitConfig {
        private final int failureRate;
        private final int waitSeconds;
        private final List<String> recordExceptions;
        private final List<String> ignoreExceptions;
        private int queueSize;
        private final AtomicInteger openings = new AtomicInteger();
        private transient String description;

        public CircuitConfig(int failureRate, int waitSeconds, List<String> recordExceptions,
                List<String> ignoreExceptions, int queueSize) {
            this.failureRate = failureRate;
            this.waitSeconds = waitSeconds;
            this.recordExceptions = recordExceptions;
            this.ignoreExceptions = ignoreExceptions;
            this.queueSize = queueSize;
        }

        public CircuitConfig(CircuitConfig other) { // violation: CopyMethodDropsField
            this.failureRate = other.failureRate;
            this.waitSeconds = other.waitSeconds;
            this.recordExceptions = new ArrayList<>(other.recordExceptions);
            this.ignoreExceptions = new ArrayList<>(other.ignoreExceptions);
        }

        public String description() {
            return description + openings.get();
        }
    }

    public static final class Limits implements Cloneable {
        private int maxItems;
        private int maxBytes;
        private int maxDepth;
        private int maxNodes;

        private Limits() {
        }

        public Limits(int maxItems, int maxBytes, int maxDepth, int maxNodes) {
            this.maxItems = maxItems;
            this.maxBytes = maxBytes;
            this.maxDepth = maxDepth;
            this.maxNodes = maxNodes;
        }

        public Limits(Limits other) {
            this.maxItems = other.maxItems;
            this.maxBytes = other.maxBytes;
            this.maxDepth = other.maxDepth;
            this.maxNodes = other.maxNodes;
        }

        public Limits copy() { // violation: CopyMethodDropsField
            Limits result = new Limits();
            result.maxItems = maxItems;
            result.maxBytes = maxBytes;
            result.maxDepth = maxDepth;
            return result;
        }

        @Override
        public Limits clone() {
            try {
                return (Limits) super.clone();
            } catch (CloneNotSupportedException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    public static final class Revision {
        private long id;
        private int version;
        private boolean dirty;
        private long createdAt;
        private String name;
        private String owner;
        private String kind;

        public Revision(String name, String owner, String kind) {
            this.name = name;
            this.owner = owner;
            this.kind = kind;
        }

        public Revision(Revision other) {
            this.name = other.name;
            this.owner = other.owner;
            this.kind = other.kind;
        }
    }

    public static final class Channels {
        private String input, output;
        private String error;
        private int width;

        public Channels(String input, String output, String error, int width) {
            this.input = input;
            this.output = output;
            this.error = error;
            this.width = width;
        }

        public Channels(Channels other) {
            this.input = other.input;
            this.output = other.output;
            this.error = other.error;
            this.width = other.width;
        }
    }

    public static final class Window {
        private final long start;
        private final long end;
        private final String label;

        public Window(long start, long end, String label) {
            this.start = start;
            this.end = end;
            this.label = label;
        }

        public Window(Window other) {
            this(other.start, other.end, other.label);
        }

        public Window shifted(long delta) {
            return new Window(start + delta, end + delta, label);
        }
    }
}
