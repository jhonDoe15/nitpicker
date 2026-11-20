package e;

import java.io.Closeable;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.BlockingQueue;
import java.util.function.Function;
import java.util.function.Supplier;

public class Flows {
    @interface Nullable {}

    @interface Keep {}

    static final List<String> SHARED = new ArrayList<>();
    static final List<String> FIXED = Collections.emptyList();

    List<String> mixed(boolean empty) {
        if (empty) {
            return Collections.emptyList();
        }
        return new ArrayList<>();
    }

    List<String> byName(boolean empty) {
        List<String> open = new ArrayList<>();
        List<String> closed = Collections.singletonList("a");
        if (empty) {
            return closed;
        }
        return open;
    }

    Collection<String> fields(boolean empty) {
        return empty ? FIXED : SHARED;
    }

    List<String> byField(boolean empty) {
        if (empty) {
            return FIXED;
        }
        return SHARED;
    }

    Map<String, String> maps(boolean empty) {
        if (empty) {
            return Collections.emptyMap();
        }
        Map<String, String> sorted = new TreeMap<>();
        return sorted;
    }

    Set<String> sets(boolean empty) {
        if (empty) {
            return Collections.emptySet();
        }
        return Collections.singleton("a");
    }

    List<String> lambdas(boolean empty) {
        Supplier<List<String>> other = () -> {
            return new ArrayList<>();
        };
        Object inner = new Object() {
            List<String> more() {
                return new LinkedList<>();
            }
        };
        return Collections.emptyList();
    }

    Object untyped(boolean empty) {
        if (empty) {
            return Collections.emptyList();
        }
        return new ArrayList<String>();
    }

    List<String> parameter(List<String> given, boolean empty) {
        List<String> copy = given;
        if (empty) {
            return (Collections.emptyList());
        }
        if (given == null) {
            return null;
        }
        return new HashMap<String, List<String>>().isEmpty() ? copy : new ArrayList<>();
    }

    @SuppressWarnings("MixedMutabilityReturnType")
    List<String> quiet(boolean empty) {
        if (empty) {
            return Collections.emptyList();
        }
        return new ArrayList<>();
    }

    void caught(BlockingQueue<String> queue) {
        try {
            queue.take();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        try {
            queue.take();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        try {
            queue.take();
        } catch (RuntimeException e) {
            throw e;
        } catch (Throwable e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
        }
        try {
            queue.take();
        } catch (IllegalStateException | Error e) {
            throw e;
        } catch (@SuppressWarnings("InterruptedExceptionSwallowed") Exception e) {
            throw new IllegalStateException(e);
        }
        try {
            queue.size();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        try {
            Thread.sleep(1);
        } catch (IllegalStateException | InterruptedException e) {
            throw new IllegalStateException(e);
        }
        try {
            Runnable later = () -> {
                try {
                    Thread.sleep(1);
                } catch (Exception inner) {
                    throw new IllegalStateException(inner);
                }
            };
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        try {
            if (queue.take() instanceof String text) {
                queue.clear();
            }
        } catch (Exception e) {
            if (e instanceof InterruptedException interrupted) {
                throw new IllegalStateException(interrupted);
            }
        }
    }

    void rethrows(BlockingQueue<String> queue) throws InterruptedException {
        try {
            queue.take();
        } catch (Exception e) {
            throw e;
        }
        try {
            queue.take();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    void hidden(BlockingQueue<String> queue) throws Exception {
        try {
            queue.take();
        } catch (Exception e) {
            throw e;
        }
    }

    void closes(Closeable plain, AutoCloseable slow) {
        try (plain) {
            plain.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        try (Sleeper sleeper = new Sleeper()) {
            sleeper.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static class Sleeper implements AutoCloseable {
        @Override
        public void close() throws InterruptedException {}
    }

    void declared(BlockingQueue<String> queue) throws Exception {
        queue.take();
    }

    void declaredBoth(BlockingQueue<String> queue) throws IOException, InterruptedException {
        queue.take();
    }

    void wider(BlockingQueue<String> queue) throws Throwable {
        queue.take();
        throw new IOException();
    }

    void masked(BlockingQueue<String> queue) throws Exception {
        queue.take();
        throw new Exception();
    }

    void handled(BlockingQueue<String> queue) throws Exception {
        try {
            queue.take();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    Flows(BlockingQueue<String> queue) throws Exception {
        queue.take();
    }

    public static void main(String[] arguments) throws Exception {
        Thread.sleep(1);
    }

    public static void main(String argument) throws Exception {
        Thread.sleep(1);
    }

    private static final Integer LIMIT = 5;
    private static final Integer USED = 6;
    private static final Integer MADE = Integer.valueOf(7);
    @Keep private static final Integer KEPT = 8;
    @Nullable private static final Long WIDE = 9L;
    static final Integer OPEN = 10;
    private final Integer own = 11;
    private static Integer loose = 12;

    int boxes(int[] numbers, List<Integer> listed, String text) {
        Integer plain = 1;
        Integer parsed = Integer.valueOf(text);
        Integer made = new Integer(2);
        Integer later;
        later = 3;
        Integer kept = 4;
        Object held = kept;
        Integer called = 5;
        called.compareTo(6);
        Integer hashed = 7;
        hashed.hashCode();
        hashed.intValue();
        Integer described = 8;
        String shown = described.toString() + described;
        Integer joined = 9;
        String line = "a" + joined;
        Integer compared = 10;
        boolean same = compared == null;
        Integer equal = 11;
        boolean other = equal == 11;
        Integer counted = 12;
        counted++;
        Integer added = 13;
        added += 1;
        Integer passed = 14;
        takes(passed);
        Integer boxedPassed = 15;
        takesBoxed(boxedPassed);
        Integer generic = 16;
        Objects.requireNonNull(generic);
        Integer listedIn = 17;
        listed.add(listedIn);
        Integer chosen = text == null ? 0 : parsed;
        Integer nulled = text == null ? null : 1;
        Integer reassigned = 18;
        reassigned = parsed;
        Integer swapped = 19;
        swapped = Integer.valueOf(20);
        Integer returned = 21;
        @Nullable Integer marked = 22;
        var inferred = Integer.valueOf(23);
        Long wide = 24L;
        long narrowed = wide;
        Boolean flag = true;
        if (flag) {
            return 0;
        }
        Character letter = 'c';
        switch (letter) {
            default:
                break;
        }
        Double ratio = 1.5;
        Supplier<Integer> supplier = () -> ratio.intValue();
        Integer referenced = 25;
        Supplier<String> named = referenced::toString;
        for (Integer each : numbers) {
            plain = each;
        }
        for (Integer each : listed) {
            plain = each;
        }
        Integer[] array = {plain};
        int[] sized = new int[later];
        int at = numbers[made];
        synchronized (returned) {
            at++;
        }
        return LIMIT + USED.hashCode() + MADE + KEPT + OPEN + own + loose + Flows.LIMIT + (int) (long) WIDE + swapped + chosen + nulled + reassigned + marked
            + inferred;
    }

    Integer boxedReturn() {
        Integer value = 1;
        return value;
    }

    int primitiveReturn() {
        Integer value = 1;
        return value;
    }

    static void takes(int value) {}

    static void takesBoxed(Integer value) {}

    private int parameters(Integer used, Integer unused, Integer boxed, @Nullable Integer marked) {
        takesBoxed(boxed);
        return used + marked;
    }

    int open(Integer used) {
        return used + 1;
    }

    static int fixed(Integer used, Long checked) {
        Objects.requireNonNull(checked);
        return used + 1;
    }

    final int closed(Integer used) {
        Function<Integer, Integer> twice = value -> value * 2;
        return twice.apply(used);
    }

    record Point(Integer x) {
        Point(Integer x) {
            this.x = x + 1;
        }

        int more(Integer y) {
            return y + x;
        }
    }

    interface Shape {
        int area(Integer scale);
    }

    static final class Square implements Shape {
        @Override
        public int area(Integer scale) {
            return scale * 2;
        }

        public int side(Integer scale) {
            return scale * 2;
        }
    }

    private void neverCalled() {}

    private void called() {}

    private void referenced() {}

    private void unusedByName() {}

    @Keep
    private void kept() {}

    private int overloaded(int value) {
        return value;
    }

    private int overloaded(String value) {
        return 1;
    }

    private static <T> T typed(T value) {
        return value;
    }

    private void recursive() {
        recursive();
    }

    void uses() {
        called();
        Runnable later = this::referenced;
        overloaded(1);
        new Hidden(1);
        new Hidden("a", 2) {};
        Level.LOW.toString();
        Object anonymous = new Object() {
            void inside() {}

            void usedInside() {
                usedInside();
            }

            @Override
            public String toString() {
                return "a";
            }
        };
        class Local {
            void lost() {}

            void found() {}
        }
        new Local().found();
    }

    private static class Hidden implements Serializable, Comparable<Hidden> {
        Hidden() {}

        Hidden(int count) {}

        Hidden(String text) {}

        Hidden(String text, int count) {}

        public void exposed() {}

        void packaged() {}

        @Override
        public int compareTo(Hidden other) {
            return 0;
        }

        private void readObject(ObjectInputStream in) {}

        private Object readResolve() {
            return this;
        }

        private void writeObject(String wrong) {}
    }

    public static class Shown extends Reached {
        private Shown(int count) {}

        private Shown(String text) {}

        static Shown make() {
            return new Shown(1);
        }
    }

    private static class Reached {
        public void inherited() {}

        private void own() {}
    }

    enum Level {
        LOW(1),
        HIGH(2) {
            void extra() {}
        };

        Level(int rank) {}

        Level(String name) {}

        private void spare() {}
    }

    private @interface Marker {
        String value() default "";

        int count() default 0;
    }

    @Marker(count = 1)
    void marked() {}
}
