package e;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

public class Types {
    static class Holder {
        Holder with(String value) {
            return this;
        }

        String value() {
            return "";
        }
    }

    abstract static class Base<R extends Holder, S> {
        class Inner {
            R held() {
                return null;
            }

            S other() {
                return null;
            }
        }

        void use(Inner inner) {
            inner.held().with("a");
        }
    }

    static class Special extends Holder {
        Special only(String value) {
            return this;
        }
    }

    static class Sub extends Base<Special, String> {
        @Override
        void use(Inner inner) {
            inner.held().only(inner.held().value());
            inner.other().trim();
        }

        class Deeper {
            void again(Inner inner) {
                inner.held().only("b");
            }
        }
    }

    interface Numbered {
        int number();
    }

    static class Parent {
        interface Marked {
            int number();
        }
    }

    static class Child extends Parent {}

    enum Choice implements Numbered, e.Types.Child.Marked {
        ONE;

        public int number() {
            return 1;
        }
    }

    interface Closer {
        void close();
    }

    static class Counted {
        boolean release() {
            return true;
        }
    }

    interface Writer {
        Writer start(String name);
    }

    interface Part {
        void write(Writer writer, String name);
    }

    static <T, U> Iterator<U> map(Iterator<? extends T> input, Function<T, ? extends U> fn) {
        return null;
    }

    static Closer wrap(Iterable<? extends Closer> closers) {
        return null;
    }

    static Closer wrap(Iterator<Closer> closers) {
        return null;
    }

    static Closer wrap(Closer... closers) {
        return null;
    }

    static Iterator<Part> object(String name, Map<String, ?> map) {
        return null;
    }

    static Iterator<Part> object(String name, Iterator<? extends Part> parts) {
        return null;
    }

    void functions(List<Counted> counted, Map<String, Integer> named) {
        Closer closer = wrap(map(counted.iterator(), each -> each::release));
        Iterator<Part> parts = object("a", map(named.entrySet().iterator(), entry -> (writer, name) -> {
            writer.start(entry.getKey());
        }));
    }

    sealed interface Query permits Wrapped, Plain {}

    record Wrapped(Query inner) implements Query {}

    record Plain() implements Query {}

    static Optional<Query> prune(Query query) {
        return switch (query) {
            case Wrapped wrapped -> {
                Optional<Query> pruned = prune(wrapped.inner());
                yield pruned.map(found -> found == wrapped.inner() ? wrapped : new Wrapped(found));
            }
            default -> Optional.of(query);
        };
    }

    static class Order {
        interface A {
            int n();
        }

        interface B {
            int n();
        }

        static class FirstNamed implements A, B {
            public int n() {
                return 1;
            }
        }

        static class LastNamed implements B, A {
            public int n() {
                return 1;
            }
        }

        static class BeforeDeclared implements Z, A {
            public int n() {
                return 1;
            }
        }

        interface Z {
            int n();
        }

        interface W {
            void run();
        }

        static class WithLibrary implements W, Runnable {
            public void run() {}
        }

        interface K {
            String call();
        }

        static class WithImported implements K, java.util.concurrent.Callable<String> {
            public String call() {
                return "";
            }
        }
    }
}
