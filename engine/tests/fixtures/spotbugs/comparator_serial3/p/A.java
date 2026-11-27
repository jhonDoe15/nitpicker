package p;
import java.util.*;
public class A {
    private static final class P1 implements Comparator<String> { public int compare(String a, String b) { return 0; } }
    static final class P2 implements Comparator<String> {
        static final Comparator<String> INSTANCE = new P2();
        public int compare(String a, String b) { return 0; }
    }
    private static class P3 implements Comparator<String> { public int compare(String a, String b) { return 0; } }
    static class P4 implements Comparator<String> { static final P4 I = new P4(); public int compare(String a, String b) { return 0; } }
    static class P5 implements Comparator<String> { static P4 I = new P4(); public int compare(String a, String b) { return 0; } }
    static class P6 implements Comparator<String> { static final int K = 3; static final Object O = new Object(); public int compare(String a, String b) { return 0; } }
    static class P7 implements Comparator<String> { static int k; public int compare(String a, String b) { return 0; } }
}
class Q1 implements Comparator<String> { static final Q1 I = new Q1(); public int compare(String a, String b) { return 0; } }
class Q2 implements Comparator<String> { private static final Comparator<String> I = new Q2(); public int compare(String a, String b) { return 0; } }
class Q3 implements Comparator<String> { static final Comparator<Integer> I = null; public int compare(String a, String b) { return 0; } }
