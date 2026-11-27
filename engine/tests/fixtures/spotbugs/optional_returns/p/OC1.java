package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OC1 {
Optional<String> c() { try { System.out.println(); } catch (RuntimeException e) { return null; } finally { System.out.println(); } return Optional.empty(); }
}
