package p;
import java.util.*;
import java.util.function.*;
public class X {
    static class B1 implements Comparator<String> { Function<String,String> f; public int compare(String a, String b) { return 0; } }
    static class B2 implements Comparator<String> { Optional<String> f; public int compare(String a, String b) { return 0; } }
    static class B3 implements Comparator<String> { Optional<Comparator<String>> f; public int compare(String a, String b) { return 0; } }
    static class B4 implements Comparator<String> { String f; public int compare(String a, String b) { return 0; } }
    static class B5 implements Comparator<String> { int f; public int compare(String a, String b) { return 0; } }
    static class B6 implements Comparator<String> { Supplier<String> f; public int compare(String a, String b) { return 0; } }
    static class B7 implements Comparator<String> { Runnable f; public int compare(String a, String b) { return 0; } }
    static class B8 implements Comparator<String> { List<String> f; public int compare(String a, String b) { return 0; } }
    static class B9 implements Comparator<String> { Function<String,String> f; Object g; public int compare(String a, String b) { return 0; } }
    static class B10 implements Comparator<String> { Object g; Function<String,String> f; public int compare(String a, String b) { return 0; } }
    static class B11 implements Comparator<String> { Function f; public int compare(String a, String b) { return 0; } }
    static class B12 implements Comparator<String> { final Function<String,String> f = null; public int compare(String a, String b) { return 0; } }
    static class B13 implements Comparator<String> { Comparator<String> f; public int compare(String a, String b) { return 0; } }
}
