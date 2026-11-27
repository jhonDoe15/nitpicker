package p;
import java.util.*;
public class Y {
    static class Plain {} static final class FPlain {} interface Mine {} enum En {A} record Rec(int a) {} static abstract class Abs {}
    static class C1 implements Comparator<String> { Plain f; public int compare(String a, String b) { return 0; } }
    static class C2 implements Comparator<String> { FPlain f; public int compare(String a, String b) { return 0; } }
    static class C3 implements Comparator<String> { Mine f; public int compare(String a, String b) { return 0; } }
    static class C4 implements Comparator<String> { En f; public int compare(String a, String b) { return 0; } }
    static class C5 implements Comparator<String> { Rec f; public int compare(String a, String b) { return 0; } }
    static class C6 implements Comparator<String> { Thread f; public int compare(String a, String b) { return 0; } }
    static class C7 implements Comparator<String> { StringBuilder f; public int compare(String a, String b) { return 0; } }
    static class C8 implements Comparator<String> { Date f; public int compare(String a, String b) { return 0; } }
    static class C9 implements Comparator<String> { Plain[] f; public int compare(String a, String b) { return 0; } }
    static class C10 implements Comparator<String> { Object[] f; public int compare(String a, String b) { return 0; } }
    static class C11 implements Comparator<String> { Abs f; public int compare(String a, String b) { return 0; } }
    static class C12 implements Comparator<String> { Iterable<String> f; public int compare(String a, String b) { return 0; } }
    static class C13 implements Comparator<String> { Comparable<String> f; public int compare(String a, String b) { return 0; } }
    static class C14 implements Comparator<String> { CharSequence f; public int compare(String a, String b) { return 0; } }
    static class C15 implements Comparator<String> { Number f; public int compare(String a, String b) { return 0; } }
}
