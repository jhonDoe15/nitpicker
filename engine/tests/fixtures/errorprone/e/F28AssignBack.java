package e;

import com.google.errorprone.annotations.CheckReturnValue;
import java.util.Map;

@CheckReturnValue
class F28AssignBack {
    abstract static class Request<R extends Request<R>> {
        R waitFor(int count) {
            return self();
        }

        abstract R self();
    }

    static class Builder<K, V> {
        Builder<K, V> putAll(Map<K, V> map) {
            return this;
        }
    }

    static class Holder {
        Builder<String, Integer> sizes = new Builder<>();
    }

    static class Action<R extends Request<R>> {
        Builder<String, Integer> own = new Builder<>();

        void run(R request, Holder holder, Map<String, Integer> map) {
            request.waitFor(1);
            holder.sizes.putAll(map);
            own.putAll(map);
            this.own.putAll(map);
        }
    }

    static class Base {
        Base add(int value) {
            return this;
        }
    }

    static class Child extends Base {
        @Override
        Base add(int value) {
            super.add(value);
            return this;
        }
    }

    static class Outer {
        Map<String, Integer> sizes;

        static class Inner {
            Builder<String, Integer> sizes = new Builder<>();
        }

        void fill(Inner inner, Map<String, Integer> map) {
            inner.sizes.putAll(map);
            var local = new Builder<String, Integer>();
            local.putAll(map);
        }
    }

    static class Base2<R extends Request<R>> {
        protected R request;
    }

    static class Derived<Q extends Request<Q>> extends Base2<Q> {
        void touch() {
            request.waitFor(2);
        }
    }

    interface Setter<V> {
        void set(V value);
    }

    static <T extends Base> void parse(java.util.function.Consumer<Setter<T>> declare, Setter<? extends Base> any) {
        declare.accept(value -> value.add(1));
        java.util.function.Consumer<T> each = value -> value.add(2);
    }

    static void wild(java.util.List<? extends Base> items) {
        items.forEach(item -> item.add(3));
    }

    static class Ack<A extends Request<A>> extends Base2<A> {
        void touch() {
            request.waitFor(3);
        }
    }

    Base shadowed;

    void lambdas(java.util.List<String> names, Map<String, Integer> map) {
        names.forEach(name -> {
            var shadowed = new Builder<String, Integer>();
            shadowed.putAll(map);
        });
    }
}
