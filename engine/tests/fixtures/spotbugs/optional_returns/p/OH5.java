package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OH5 {
Optional<String> c() { try (StringReader r = new StringReader("")) { } catch (RuntimeException e) { return null; } return Optional.empty(); }
}
