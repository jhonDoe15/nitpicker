package p;
import java.util.*;
class R1 implements Comparator<String> { Comparator<String> inner; public int compare(String a, String b) { return 0; } }
class R2 implements Comparator<String> { static Comparator<String>[] arr; public int compare(String a, String b) { return 0; } }
class R3 implements Comparator<String> { static TreeMap<String,String> m; public int compare(String a, String b) { return 0; } }
class R4 extends R5 { public int compare(String a, String b) { return 0; } }
class R5 implements Comparator<String> { static final R5 I = new R5(); public int compare(String a, String b) { return 0; } }
interface R6 { Comparator<String> C = null; }
class R7 implements Comparator<String>, R6 { public int compare(String a, String b) { return 0; } }
class R8 implements Comparator<String> { static Object o = (Comparator<String>) (a, b) -> 0; public int compare(String a, String b) { return 0; } }
