package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OB4 {
Optional<String> c(int x) { return switch (x) { case 1 -> Optional.empty(); default -> { yield null; } }; }
}
