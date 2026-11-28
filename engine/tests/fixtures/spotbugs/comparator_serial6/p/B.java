package p;
import java.util.*;
import java.io.*;
import java.text.Collator;
import java.util.concurrent.*;
public class B {
    static class Ser implements Comparator<String>, Serializable { public int compare(String a, String b) { return 0; } }
    static class NonSer implements Comparator<String> { public int compare(String a, String b) { return 0; } }
    interface SerI extends Comparator<String>, Serializable {}
    interface PlainI extends Comparator<String> {}
    static class F1 implements Comparator<String> { Ser c; public int compare(String a, String b) { return 0; } }
    static class F2 implements Comparator<String> { NonSer c; public int compare(String a, String b) { return 0; } }
    static class F3 implements Comparator<String> { SerI c; public int compare(String a, String b) { return 0; } }
    static class F4 implements Comparator<String> { PlainI c; public int compare(String a, String b) { return 0; } }
    static class F5 implements Comparator<String> { Collator c; public int compare(String a, String b) { return 0; } }
    static class F6 implements Comparator<String> { Object c; public int compare(String a, String b) { return 0; } }
    static class F7 implements Comparator<String> { Ser[] c; public int compare(String a, String b) { return 0; } }
    static class F8 implements Comparator<String> { Map<String,Comparator<String>> c; public int compare(String a, String b) { return 0; } }
    static class F9<T extends Comparator<String>> implements Comparator<String> { T c; public int compare(String a, String b) { return 0; } }
    static class F10 implements Comparator<String> { ConcurrentSkipListMap<String,String> c; public int compare(String a, String b) { return 0; } }
    static class F11 implements Comparator<String> { Comparator<?> c; public int compare(String a, String b) { return 0; } }
    static class F12 implements Comparator<String> { Comparator c; public int compare(String a, String b) { return 0; } }
    static class F13 implements Comparator<String> { Comparator<String> c, d; int x; public int compare(String a, String b) { return 0; } }
    static class F14 implements Comparator<String> { Comparable<String> c; public int compare(String a, String b) { return 0; } }
    static class F15 implements Comparator<String> { Comparator<String> c() {return null;} public int compare(String a, String b) { return 0; } }
    static class F16 implements Comparator<String> { Comparator<String>[] c; Object o; public int compare(String a, String b) { return 0; } }
    static class F17 implements Comparator<String> { F17 self; public int compare(String a, String b) { return 0; } }
    static class F18 implements Comparator<String> { Ser[][] c; public int compare(String a, String b) { return 0; } }
    static class F19 implements Comparator<String> { Comparator<String> c = (a, b) -> 0; public int compare(String a, String b) { return 0; } }
    static class F20 implements Comparator<String> { SerI[] c; public int compare(String a, String b) { return 0; } }
}
