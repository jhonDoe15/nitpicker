package e;

import com.google.errorprone.annotations.CheckReturnValue;
import java.util.Iterator;
import java.util.List;
import java.util.function.Consumer;

@CheckReturnValue
class F28ReferenceOverload {
    F28ReferenceOverload append(boolean value) {
        return this;
    }

    F28ReferenceOverload append(char value) {
        return this;
    }

    F28ReferenceOverload append(Object value) {
        return this;
    }

    F28ReferenceOverload append(String value) {
        return this;
    }

    F28ReferenceOverload add(int value) {
        return this;
    }

    F28ReferenceOverload add(long value) {
        return this;
    }

    void all(Iterable<?> items, Iterator<?> each, List<String> names, List<? extends CharSequence> texts) {
        items.forEach(this::append);
        each.forEachRemaining(this::append);
        names.forEach(this::append);
        texts.forEach(this::append);
        Consumer<Character> letters = this::append;
        Consumer<Integer> numbers = this::add;
        letters.accept('a');
        numbers.accept(1);
    }

    static class Holder<N extends F28ReferenceOverload> {
        N take(N kept, F28ReferenceOverload plain) {
            N local = kept;
            if (local != null) local.append(1);
            kept.append('c');
            plain.append(true);
            return local;
        }
    }
}
