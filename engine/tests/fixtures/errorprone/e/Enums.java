package e;

import com.google.errorprone.annotations.Immutable;
import com.google.errorprone.annotations.ImmutableTypeParameter;
import com.google.errorprone.annotations.concurrent.LazyInit;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;

/** Enum fields that can and cannot change. */
public class Enums {
    /** Plain cases. */
    public enum Plain {
        ONE("a"),
        TWO("b");

        private String label;
        private final String fixed;
        private final int count = 1;
        private final Integer boxed = 2;
        private final String[] names = {};
        private final int[][] grid = {};
        private final Object anything = "";
        private final List<String> list = new ArrayList<>();
        private final EnumSet<Plain> set = EnumSet.noneOf(Plain.class);
        private final Map<String, Integer> map = Map.of();
        private final Optional<String> present = Optional.empty();
        private final Optional<List<String>> listed = Optional.empty();
        private final Optional<?> anyOf = Optional.empty();
        private final Optional<? extends Number> numbers = Optional.empty();
        private final Optional<? super Integer> lower = Optional.empty();
        private final Optional raw = Optional.empty();
        private final Comparator<String> order = null;
        private final Function<String, ? extends Number> function = null;
        private final Supplier<Map.Entry<String, int[]>> supplier = null;
        private final Other other = Other.A;
        private final Override annotation = null;
        private final Class<?> type = String.class;
        private final Holder holder = null;
        private final Frozen frozen = null;
        private final FrozenChild child = null;
        private final Box<String> box = null;
        private final Box<Object> openBox = null;
        private final Box rawBox = null;
        private final Strict<String> strict = null;
        private final Strict<Holder> loose = null;
        private final Strict<?> wild = null;
        private final Outer<String>.Inner inner = null;
        private final Enums.Holder qualified = null;
        private final java.util.Date date = null;
        private final Thread.State state = null;
        private final Map.Entry<String, String> entry = null;
        private final Throwable thrown = null;
        private final Iterable<String> iterable = null;
        private final java.time.Duration duration = null;
        private final java.util.concurrent.atomic.AtomicLong atomic = null;
        private final Viaduct viaduct = null;
        private final KeptBox<Object> kept = null;
        private final Bounded<?> bounded = null;
        static String shared;
        static final List<String> SHARED = new ArrayList<>();
        @LazyInit private String lazy;
        @SuppressWarnings("Immutable")
        private String quietByOtherName;
        @SuppressWarnings("ImmutableEnumChecker")
        private final Object quiet = null;
        String first, second;
        final String[] many[] = {}, single = {};
        final String trailing[] = {};
        public volatile int moving;

        Plain(String fixed) {
            this.fixed = fixed;
        }
    }

    /** The other enum. */
    public enum Other {
        A {
            private int inBody;
            private final List<String> listInBody = null;

            @Override
            void run() {}
        },
        B;

        void run() {}
    }

    /** Annotated although it need not be. */
    @Immutable
    public enum Marked {
        X;
        private int counter;
    }

    /** Annotated through its interface. */
    @Immutable
    public enum MarkedThrough implements FrozenFace {
        X
    }

    /** Takes an immutable interface with a type argument. */
    public enum Through implements Container<Object>, Comparator<Through> {
        X;

        @Override
        public int compare(Through left, Through right) {
            return 0;
        }
    }

    /** Suppressed as a whole. */
    @SuppressWarnings("ImmutableEnumChecker")
    public enum Silent {
        X;
        private int counter;
    }

    /** Suppressed by the other name. */
    @SuppressWarnings("Immutable")
    public enum SilentToo {
        X;
        private int counter;
    }

    /** Not marked. */
    public static class Holder {}

    /** Marked. */
    @Immutable
    public static class Frozen {}

    /** Marked through its parent. */
    public static class FrozenChild extends Frozen {}

    /** Marked interface. */
    @Immutable
    public interface FrozenFace {}

    /** Marked through an interface two steps up. */
    public interface MiddleFace extends FrozenFace {}

    /** Reaches the mark the long way. */
    public static class Viaduct implements MiddleFace {}

    /** Holds its type argument. */
    @Immutable(containerOf = "T")
    public static class Box<T> {}

    /** Holds its type argument through its parent. */
    public static class KeptBox<U> extends Box<U> {}

    /** Holds an interface type argument. */
    @Immutable(containerOf = {"T"})
    public interface Container<T> {}

    /** Takes only immutable arguments. */
    @Immutable
    public static class Strict<@ImmutableTypeParameter T> {}

    /** Has a bound. */
    @Immutable(containerOf = "T")
    public static class Bounded<T extends Holder> {}

    /** Has a bound that names itself. */
    @Immutable(containerOf = "T")
    public static class Recursive<T extends Comparable<T>> {}

    /** Generic with an inner class. */
    public static class Outer<T> {
        /** Inner. */
        public class Inner {}
    }

    void handler() throws IOException {}
}
