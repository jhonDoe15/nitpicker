package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OI6 {
Optional<String> c(boolean b) { return switch (1) { case 1 -> b ? null : Optional.empty(); default -> Optional.empty(); }; }
}
