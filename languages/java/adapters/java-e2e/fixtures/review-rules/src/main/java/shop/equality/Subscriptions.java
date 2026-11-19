package shop.equality;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

public final class Subscriptions {
    private Subscriptions() {
    }

    public static final class ListenerWrap {
        private final Runnable listener;

        public ListenerWrap(Runnable listener) {
            this.listener = listener;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof ListenerWrap wrap && listener.equals(wrap.listener);
        }

        @Override
        public int hashCode() { // violation: HashCodeDisagreesWithEquals
            return super.hashCode();
        }
    }

    public static final class ServiceListener {
        private final String name;
        private final List<String> serviceNames = new ArrayList<>();

        public ServiceListener(String name) {
            this.name = name;
        }

        public void add(String service) {
            serviceNames.add(service);
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (other == null || getClass() != other.getClass()) {
                return false;
            }
            ServiceListener that = (ServiceListener) other;
            return Objects.equals(name, that.name);
        }

        @Override
        public int hashCode() { // violation: HashCodeDisagreesWithEquals
            return Objects.hash(name, serviceNames);
        }
    }

    public static final class Pair {
        private final String left;
        private final String right;

        public Pair(String left, String right) {
            this.left = left;
            this.right = right;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Pair that && left.equals(that.left) && right.equals(that.right);
        }

        @Override
        public int hashCode() {
            return left.hashCode();
        }
    }

    public static final class Tagged {
        private final String id;
        private final String label;
        private int cachedHash;

        public Tagged(String id, String label) {
            this.id = id;
            this.label = label;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Tagged that && id.equals(that.id) && label.equals(that.label);
        }

        @Override
        public int hashCode() {
            if (cachedHash == 0) {
                cachedHash = Objects.hash(id, label);
            }
            return cachedHash;
        }
    }

    public static final class Identity {
        private final String name;

        public Identity(String name) {
            this.name = name;
        }

        @Override
        public boolean equals(Object other) {
            return this == other;
        }

        @Override
        public int hashCode() {
            return System.identityHashCode(this) + name.length();
        }
    }

    public static final class Key {
        private final String host;
        private final int port;
        private final int hash;

        public Key(String host, int port) {
            this.host = host;
            this.port = port;
            this.hash = 31 * host.hashCode() + port;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Key that && host.equals(that.host) && port == that.port;
        }

        @Override
        public int hashCode() {
            return hash;
        }
    }

    public static final class Sized {
        private final String[] items;
        private final int count;

        public Sized(String[] items) {
            this.items = items;
            this.count = items.length;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Sized that && Arrays.equals(items, that.items);
        }

        @Override
        public int hashCode() {
            return Objects.hash(Arrays.hashCode(items), count);
        }
    }

    public static final class Task {
        private final String taskId;
        private final String id;

        public Task(String taskId, String prefix) {
            this.taskId = taskId;
            this.id = prefix + "-" + taskId;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Task that && id.equals(that.id);
        }

        @Override
        public int hashCode() {
            return Objects.hash(taskId, id);
        }
    }

    public static final class Block {
        private final String source;
        private final String dataReference;

        public Block(String data) {
            this.source = data;
            this.dataReference = data;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Block that && dataReference.equals(that.dataReference);
        }

        @Override
        public int hashCode() {
            return Objects.hash(source);
        }
    }

    public static final class Coded {
        private final String left;
        private final String right;
        private final int code;

        public Coded(String left, String right) {
            this.left = left;
            this.right = right;
            this.code = Objects.hash(left, right);
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Coded that && left.equals(that.left) && right.equals(that.right);
        }

        @Override
        public int hashCode() {
            return code;
        }
    }
}
