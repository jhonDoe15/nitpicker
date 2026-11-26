package p;
public class Sig {
    public static class S1 { public Integer compareTo(S1 o){return 0;} }
    public static class S2 { public short compareTo(S2 o){return 0;} }
    public static class S3 { public void compareTo(S3 o){} }
    public static class S4 { public int compareTo(Object o){return 0;} }
    public static class S5 { public int compareTo(S5... o){return 0;} }
    public static class S6 { protected int compareTo(S6 o){return 0;} }
    public static class S7 { int compareTo(S7 o){return 0;} }
    public static class S8 { public int compareTo(S8 o) throws Exception {return 0;} }
    public static class S9 { public static int compareTo(Object o){return 0;} }
    public static class S10 { public int compareTo(CharSequence o){return 0;} }
    public static class S11 { public int compareTo(S11 o){return 0;} public int compareTo(Object o){return 0;} }
    public static class S12 { public int compareTo(S12 o){return 0;} public boolean equals(Object o) {return true;} public int hashCode(){return 1;} }
    public static class S14 { public int CompareTo(S14 o){return 0;} public int compare(S14 o){return 0;} }
    public static class S15<T> { public int compareTo(T o){return 0;} }
    public static class S16<T extends Number> { public int compareTo(T o){return 0;} }
}
