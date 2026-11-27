package p;
import java.util.*;
public class A {
    int[] arr = new int[10]; int[][] arr2 = new int[10][10];
    List<String> list = new ArrayList<>(); Map<Integer,String> map = new HashMap<>();
    Random fr = new Random();
    Object a1(Object o) { int h = o.hashCode(); h = 5; return Math.abs(h); }
    Object a2(Object o, boolean b) { int h = o.hashCode(); if (b) h = 3; return Math.abs(h); }
    Object a3(Object o) { int h; h = o.hashCode(); return Math.abs(h); }
    Object a4(Object o) { final int h = o.hashCode(); return Math.abs(h); }
    Object a5(Object o) { return Math.abs(o.hashCode() + 1); }
    Object a6(Object o) { return Math.abs((int) o.hashCode()); }
    Object a7(Object o) { int h = o.hashCode(); for (int i=0;i<2;i++) { h++; } return Math.abs(h); }
    Object a8(Object o) { int h = o.hashCode(); int g = h; return Math.abs(g); }
    Object a9(Object o) { return Math.abs(Math.abs(o.hashCode())); }
    Object a10(Object o) { int h = o.hashCode(); return Math.abs(h * 31); }
    Object a11(Object o) { long h = o.hashCode(); return Math.abs(h); }
    Object a12(Random r) { int x = r.nextInt(); return Math.abs(x); }
    Object a13(Random r) { long x = r.nextLong(); return Math.abs(x); }
    Object a14(Random r) { return Math.abs((int) r.nextLong()); }
    Object a15(Random r) { return Math.abs(r.nextInt(10) ); }
    Object a16(Random r) { return Math.abs(r.nextGaussian()); }
    Object a17(Random r) { return Math.abs(r.nextFloat()); }
    Object a18(Random r) { return Math.abs(new Random().nextInt()); }
    Object a19(Random r) { return Math.abs(fr.nextInt()); }
    Object a20() { return Math.abs(new Random().nextLong()); }
    Object a21(Object o) { return StrictMath.abs(o.hashCode()); }
    Object a22(String s) { return Math.abs(s.hashCode()) ; }
    Object a23(Object o) { return Math.abs(
        o.hashCode()
    ); }
    Object a24(Object o) { return Math
        .abs(o.hashCode()); }
    Object a25(Object o) { return Math.abs(o.hashCode(
    )); }
    Object a26(Object o) { return Math.abs(((Object)o).hashCode()); }
    Object a27(Object o) { return Math.abs(o.hashCode()) + Math.abs(o.hashCode()); }
    Object a28(int[] a) { return Math.abs(a.hashCode()); }
    Object a29(Class<?> c) { return Math.abs(c.hashCode()); }
    Object a30(Object o) { return Math.abs(o.hashCode()) >= 0; }
    // rem
    Object r1(Object o) { return arr[o.hashCode() % 10]; }
    Object r2(Object o) { return arr[o.hashCode() % 10 + 1]; }
    Object r3(Object o) { return arr[(o.hashCode() % 10) + 1]; }
    Object r4(Object o) { return arr[Math.max(0, o.hashCode() % 10)]; }
    Object r5(Object o) { return arr2[o.hashCode() % 10][0]; }
    Object r6(Object o) { return arr2[0][o.hashCode() % 10]; }
    Object r7(Object o) { return map.get(o.hashCode() % 10); }
    Object r8(Object o) { return list.get(o.hashCode() % 10); }
    Object r9(Object o) { return list.subList(o.hashCode() % 10, 3); }
    Object r10(Object o) { return list.indexOf(o.hashCode() % 10); }
    Object r11(Object o) { list.add(o.hashCode() % 10, "x"); return null; }
    Object r12(Object o) { return list.set(o.hashCode() % 10, "x"); }
    Object r13(Object o) { return list.remove(o.hashCode() % 10); }
    Object r14(Object o) { return new ArrayList<String>().listIterator(o.hashCode() % 10); }
    Object r15(Object o) { return "abc".charAt(o.hashCode() % 10); }
    Object r16(Object o) { return new int[o.hashCode() % 10]; }
    Object r17(Object o) { int i = o.hashCode() % 10; return arr[i]; }
    Object r18(Object o) { int i = o.hashCode() % 10; i = 3; return arr[i]; }
    Object r19(Object o) { int i = o.hashCode() % 10; return arr[i + 1]; }
    Object r20(Object o) { int i = o.hashCode() % 10; int j = i; return arr[j]; }
    Object r21(Object o, boolean b) { int i = o.hashCode() % 10; if (b) return arr[i]; return null; }
    Object r22(Object o) { int i = o.hashCode(); return arr[i % 10]; }
    Object r23(Object o) { int i = o.hashCode(); int j = i % 10; return list.get(j); }
    Object r24(Object o) { return arr[-(o.hashCode() % 10)]; }
    Object r25(Object o) { return arr[(int) (o.hashCode() % 10L)]; }
    Object r26(Object o) { return arr[(o.hashCode() % 10) * 2]; }
    Object r27(Object o) { return o.hashCode() % 10 == 3; }
    Object r28(Object o) { return o.hashCode() % 10 < 0; }
    Object r29(Object o) { return Collections.nCopies(3, "a").get(o.hashCode() % 10); }
    Object r30(Object o) { LinkedList<String> l = new LinkedList<>(); return l.get(o.hashCode() % 10); }
    Object r31(Object o) { Vector<String> l = new Vector<>(); return l.get(o.hashCode() % 10); }
    Object r32(Object o) { return String.valueOf(new char[3], o.hashCode() % 10, 1); }
    Object r33(Object o) { char[] c = {}; return c[o.hashCode() % 10]; }
    Object r34(Object o) { return arr[Math.abs(o.hashCode()) % 10]; }
    Object r35(Random r) { return arr[r.nextInt() % 10]; }
    Object r36(Random r) { return arr[(int)(r.nextLong() % 10)]; }
    Object r37(Random r) { return arr[(int) r.nextLong() % 10]; }
    Object r38(Random r) { return list.get(r.nextInt() % 10); }
    Object r39(Random r) { return arr[new Random().nextInt() % 10]; }
    Object r40(Object o) { return arr[o.hashCode() 
         % 10]; }
    Object r41(Object o) { return arr[
         System.identityHashCode(o) % 10]; }
    Object r42(Object o) { return arr[(short)(o.hashCode() % 10)]; }
    Object r43(Object o) { return arr[(o.hashCode()) % 10]; }
    Object r44(Object o) { Integer i = o.hashCode() % 10; return arr[i]; }
    Object r45(Object o) { return arr[o.hashCode() % arr.length]; }
    Object r46(Object o) { return arr[o.hashCode() % 10 % 5]; }
}
