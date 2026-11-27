package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class O6 {
Optional<String> c(boolean b) { return switch (b ? 1 : 0) { case 1 -> Optional.empty(); default -> null; }; }
}
