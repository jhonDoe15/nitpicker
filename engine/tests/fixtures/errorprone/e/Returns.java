package e;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

public class Returns {
    @interface CanIgnoreReturnValue {}

    @interface CheckReturnValue {}

    static class Chain {
        Chain step(int by) {
            return this;
        }

        @CanIgnoreReturnValue
        Chain loose(int by) {
            return this;
        }

        void nothing() {}

        Void boxed() {
            return null;
        }

        static Chain start() {
            return new Chain();
        }
    }

    @CanIgnoreReturnValue
    static class Loose {
        int count() {
            return 1;
        }

        @CheckReturnValue
        int strict() {
            return 2;
        }
    }

    @CheckReturnValue
    @CanIgnoreReturnValue
    int both() {
        return 3;
    }

    @CheckReturnValue
    void onVoid() {}

    void calls(Chain chain, Loose loose, List<Chain> chains, List<String> names) {
        chain.step(1);
        chain.loose(1);
        chain.nothing();
        chain.boxed();
        Chain.start();
        new Chain();
        new ArrayList<String>();
        names.size();
        loose.count();
        loose.strict();
        Chain kept = chain.step(2);
        for (int i = 0; i < 2; chain.step(i), i++) {
            kept.nothing();
        }
        Runnable later = () -> chain.step(3);
        Consumer<Chain> each = Chain::nothing;
        chains.forEach(link -> link.step(4));
        Runnable made = Chain::new;
        Runnable started = Chain::start;
        later.run();
        each.accept(chain);
        made.run();
        started.run();
        switch (names.size()) {
            case 0 -> chain.step(5);
            default -> chain.nothing();
        }
    }
}
