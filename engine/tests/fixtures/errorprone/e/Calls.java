package e;

import static java.lang.System.err;

import java.io.PrintStream;
import java.io.PrintWriter;
import java.text.BreakIterator;
import java.text.Collator;
import java.text.DateFormat;
import java.text.DateFormatSymbols;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.MessageFormat;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.Currency;
import java.util.Formattable;
import java.util.Formatter;
import java.util.Locale;
import java.util.ResourceBundle;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ForkJoinTask;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;

public class Calls {
    @interface CanIgnoreReturnValue {}

    static final String NUMBERED = "%d items";
    static final String JOINED = "%s and " + "%5.2f";
    static final String PLAIN = "%s items";

    static class Shown implements Formattable {
        @Override
        public void formatTo(Formatter formatter, int flags, int width, int precision) {}
    }

    abstract static class Pair<A, B> implements Future<A> {}

    static class Waits {
        void pause(long millis) {}

        void pause(Duration time) {
            pause(time.toMillis());
        }

        void hold(long amount, TimeUnit unit) {}

        void hold(Duration time) {
            hold(time.toNanos(), TimeUnit.NANOSECONDS);
        }

        int count(int millis) {
            return millis;
        }

        void count(Duration time) {}

        static void fixed(double seconds) {}

        void fixed(Duration time) {}

        static void at(long epoch) {}

        static void at(Instant when) {}

        <T> T typed(int millis) {
            return null;
        }

        <T> T typed(Duration time) {
            return null;
        }
    }

    static class LongerWaits extends Waits {
        @Override
        void pause(Duration time) {
            pause(3L);
        }

        void more() {
            pause(4);
            this.pause(5L);
            hold(6, TimeUnit.SECONDS);
            hold(7, java.util.concurrent.TimeUnit.MICROSECONDS);
            count(8);
            fixed(9.5);
            at(10L);
            Waits.at(11);
            this.<String>typed(12);
            new Waits().pause(13);
        }

        void unit(TimeUnit unit) {
            hold(14, unit);
            hold(15, TimeUnit.valueOf("SECONDS"));
        }
    }

    ExecutorService executor;
    CompletionService<String> completion;
    ForkJoinTask<String> task;
    CompletableFuture<String> promise;

    Future<String> future() {
        return executor.submit(() -> "a");
    }

    @CanIgnoreReturnValue
    Future<String> loose() {
        return null;
    }

    Future<Future<String>> twice() {
        return null;
    }

    <T> Future<T> wrap(T value) {
        return null;
    }

    <T> Pair<String, T> pair(T value) {
        return null;
    }

    <T extends Future<String>> T same(T value) {
        return value;
    }

    void dropped(Runnable work) {
        executor.submit(work);
        future();
        loose();
        task.fork();
        completion.submit(() -> "b");
        promise.exceptionally(failure -> "c");
        promise.thenRun(work);
        same(promise);
        for (future(); ; future()) {
            break;
        }
        Runnable later = () -> future();
        Runnable block = () -> {
            future();
        };
        Consumer<Runnable> each = executor::submit;
        Supplier<Future<String>> kept = this::future;
        Future<?> held = executor.submit(work);
        new Calls().future();
    }

    void nested(Runnable work) {
        Future<Future<String>> first = twice();
        Future<Future<Future<String>>> second = wrap(twice());
        Future<String> plain = wrap("d");
        Pair<String, Future<String>> made = pair(future());
        Pair<String, String> fine = pair("e");
        twice();
    }

    Object lost() {
        return future();
    }

    Object fine() {
        return "f";
    }

    Future<String> typed() {
        return future();
    }

    void functions() {
        Supplier<Object> first = () -> future();
        Supplier<Object> second = () -> {
            return future();
        };
        Supplier<?> third = () -> future();
        Callable<Object> fourth = this::future;
        Function<String, Object> fifth = text -> future();
        Supplier<Future<String>> sixth = () -> future();
        Supplier<Object> seventh = () -> {
            Supplier<Future<String>> inner = () -> {
                return future();
            };
            return inner;
        };
        java.lang.reflect.InvocationHandler handler = (proxy, method, arguments) -> future();
    }

    void formats(PrintStream stream, PrintWriter writer, StringBuilder builder, int count, Shown shown) throws Exception {
        String.format("%d items", count);
        String.format("%s items", count);
        String.format("%5s %-3b %c %h %n %% %2$s %<s", count, true, 'c', count);
        String.format(NUMBERED, count);
        String.format(JOINED, count, 1.5);
        String.format(PLAIN, count);
        String.format(PLAIN, shown);
        String.format(builder.toString(), count);
        String.format(builder.toString(), shown);
        String.format(Locale.ROOT, "%d", count);
        final String local = "%x";
        String.format(local, count);
        String loose = "%x";
        String.format(loose, count);
        String.format("%" + "d", count);
        String.format(("%e"), 1.0);
        "%d".formatted(count);
        "%s".formatted(count);
        "%s".formatted(shown);
        NUMBERED.formatted(count);
        stream.printf("%d", count);
        stream.format("%s", count);
        stream.printf(Locale.ROOT, "%d", count);
        writer.printf("%,d", count);
        writer.format("%s", shown);
        System.out.printf("%d", count);
        System.err.format("%d", count);
        err.printf("%d", count);
        java.lang.System.out.printf("%d", count);
        MessageFormat.format("{0}", count);
        MessageFormat.format("%d {0}", count);
        MessageFormat.format("{0}", shown);
    }

    void factories(Currency currency, StringBuilder builder, PrintStream stream) throws Exception {
        currency.getSymbol();
        currency.getSymbol(Locale.ROOT);
        BreakIterator.getWordInstance();
        BreakIterator.getLineInstance(Locale.ROOT);
        Collator.getInstance();
        NumberFormat.getInstance();
        NumberFormat.getPercentInstance();
        NumberFormat.getInstance(Locale.ROOT);
        DecimalFormat.getInstance();
        DateFormatSymbols.getInstance();
        DecimalFormatSymbols.getInstance();
        DateTimeFormatter.ofPattern("yyyy");
        DateTimeFormatter.ofPattern("yyyy", Locale.ROOT);
        new DateTimeFormatterBuilder().toFormatter();
        new DateTimeFormatterBuilder().toFormatter(Locale.ROOT);
        DateFormat.getInstance();
        DateFormat.getDateInstance();
        DateFormat.getDateInstance(DateFormat.SHORT);
        DateFormat.getDateInstance(DateFormat.SHORT, Locale.ROOT);
        DateFormat.getTimeInstance();
        DateFormat.getDateTimeInstance();
        DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT);
        SimpleDateFormat.getDateInstance();
        ResourceBundle.getBundle("a");
        ResourceBundle.getBundle("a", Locale.ROOT);
        ResourceBundle.getBundle("a", Calls.class.getModule());
        new MessageFormat("{0}");
        new MessageFormat("{0}", Locale.ROOT);
        new DateFormatSymbols();
        new DecimalFormatSymbols();
        new DecimalFormat();
        new DecimalFormat("#");
        new DecimalFormat("#", new DecimalFormatSymbols(Locale.ROOT));
        new SimpleDateFormat();
        new SimpleDateFormat("yyyy");
        new SimpleDateFormat("yyyy", Locale.ROOT);
        new SimpleDateFormat("yyyy") {};
        new Formatter();
        new Formatter(builder);
        new Formatter(stream);
        new Formatter("file");
        new Formatter("file", "UTF-8");
        new Formatter(Locale.ROOT);
        new Formatter(builder, Locale.ROOT);
    }
}
