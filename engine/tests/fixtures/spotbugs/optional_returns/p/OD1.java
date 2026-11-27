package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OD1 {
Optional<String> c() { Runnable r = () -> { return; }; java.util.function.Supplier<Optional<String>> s = () -> null; return Optional.empty(); }
}
