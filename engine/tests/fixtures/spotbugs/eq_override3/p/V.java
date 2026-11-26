package p;
public class V {
    public static class C { public boolean equals(Object o){return o==this;} public int hashCode(){return 1;} }
    public static class V1 extends C { int f; boolean equals(V1 o){return true;} }
    public static class V2 extends C { int f; protected boolean equals(V2 o){return true;} }
    public static class V3 extends C { int f; public static boolean equals(V3 o){return true;} }
    public static class V4 extends C { int f; public boolean equals(V4 o){return true;} public boolean equals(Object o){return true;} public int hashCode(){return 1;}}
    public static class V5 extends C { int f; public synchronized boolean equals(V5 o){return true;} }
    public static class V6 extends C { int f; public boolean equals(V6 o){return true;} public boolean equals(C o){return true;} }
    public static class V7 extends C { int f; public final boolean equals(V7 o){return true;} }
}
