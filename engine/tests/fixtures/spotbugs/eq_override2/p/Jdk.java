package p;
import java.util.*;
import java.io.*;
public class Jdk {
    public static class HM extends HashMap<String,String> { int f; }
    public static class LHM extends LinkedHashMap<String,String> { int f; }
    public static class AM extends AbstractMap<String,String> { int f; public Set<Map.Entry<String,String>> entrySet(){return null;} }
    public static class AL extends AbstractList<String> { int f; public String get(int i){return null;} public int size(){return 0;} }
    public static class ALX extends ArrayList<String> { int f; }
    public static class HS extends HashSet<String> { int f; }
    public static class TS extends TreeSet<String> { int f; }
    public static class Vec extends Vector<String> { int f; }
    public static class Stk extends Stack<String> { int f; }
    public static class Str extends java.util.Date { int f; }
    public static class FIS extends File { int f; FIS(){super("x");} }
    public static class Pt extends java.awt.Point { int f; }
    public static class Num extends Number { int f; public int intValue(){return 0;} public long longValue(){return 0;} public float floatValue(){return 0;} public double doubleValue(){return 0;} }
    public static class BI extends java.math.BigInteger { int f; BI(){super("1");} }
    public static class Ex extends RuntimeException { int f; }
    public static class Opt extends java.util.concurrent.ConcurrentHashMap<String,String> { int f; }
    public static class LL extends LinkedList<String> { int f; }
    public static class AbSeq extends AbstractCollection<String> { int f; public Iterator<String> iterator(){return null;} public int size(){return 0;} }
    public static class AbSet extends AbstractSet<String> { int f; public Iterator<String> iterator(){return null;} public int size(){return 0;} }
    public static class Props extends Properties { int f; }
    public static class HT extends Hashtable<String,String> { int f; }
}
