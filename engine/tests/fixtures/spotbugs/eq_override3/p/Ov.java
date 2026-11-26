package p;
import java.util.*;
public class Ov {
    public static class C { public boolean equals(Object o){return o==this;} public int hashCode(){return 1;} }
    public static class O1 extends C { int f; public boolean equals(O1 o){return true;} }
    public static class O2 extends C { int f; public boolean equals(String o){return true;} }
    public static class O3 extends C { int f; public boolean equals(C o){return true;} }
    public static class O4 extends C { int f; public boolean equals(){return true;} }
    public static class O5 extends C { int f; public boolean equals(Object a, Object b){return true;} }
    public static class O6 extends C { int f; public boolean equals(Ov o){return true;} }
    public static class O8 extends C { int f; public static boolean equals(O8 o, O8 p){return true;} }
    public static class O9 extends C { int f; public boolean equals(List<String> o){return true;} }
    public static class O10 extends C { int f; private boolean equals(O10 o){return true;} }
    public static class O11 extends C { int f; public boolean equals(O11[] o){return true;} }
    public static class O12 extends C { int f; public boolean equals(O11 o){return true;} }
    public static class O13 extends C { int f; public boolean equals(int o){return true;} }
}
