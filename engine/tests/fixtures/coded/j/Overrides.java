package j;

import java.util.Collection;
import java.util.List;

interface Named {
    String toString();

    int hashCode();
}

interface MoreNamed extends Named {
    String toString();

    boolean equals(Object other);
}

abstract class Base<B, T> {
    abstract B defaultValue(T value);

    abstract B fallback(T value);
}

abstract class ConcreteBuilder<V, C extends Collection<V>> extends Base<ConcreteBuilder<V, C>, C> {
    ConcreteBuilder<V, C> defaultValue(Collection<? extends V> value) {
        return this;
    }

    ConcreteBuilder<V, C> fallback(C value) {
        return this;
    }
}

interface Sorter {
    <T extends Comparable<T>> void sort(T first, T[] rest);

    <T> void any(T first, List<T> rest);
}

class OwnSorter implements Sorter {
    public <T extends Comparable<T>> void sort(T first, T[] rest) {
    }

    public <U> void any(U first, List<U> rest) {
    }
}

class Typed {
    void take(List<String> values) {
    }

    void keep(List<String> values) {
    }
}

class Raw extends Typed {
    void take(List values) {
    }

    void keep(List<String> values) {
    }
}
