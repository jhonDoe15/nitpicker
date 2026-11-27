package p;
import java.text.*;
import java.util.*;
public class B {
    static { A.DF.format(new Date()); }
    static String sf = A.DF.format(new Date());
    static { A.DF.parse("x", null); A.CA[0].add(1, 2); }
    enum En { X; static { A.DF.setLenient(true); } En() { A.DF.setLenient(true);} }
    interface J { String S = A.DF.format(new Date()); }
}
