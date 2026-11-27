package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OB5 {
Optional<String> c(int x) { return switch (x) { case 1 -> { yield null; } default -> Optional.empty(); }; }
}
