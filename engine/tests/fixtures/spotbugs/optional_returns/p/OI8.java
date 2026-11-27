package p; import java.io.*; import java.util.*; import java.util.concurrent.*;
public class OI8 {
Optional<String> c(int x) { return switch (x) { case 1: yield Optional.empty(); default: yield null; }; }
}
