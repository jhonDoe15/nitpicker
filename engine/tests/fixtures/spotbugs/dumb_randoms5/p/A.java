package p;
import java.util.*; import java.math.BigDecimal;
public class A {
    LinkedList<String> ll; AbstractList<String> abl; List<String> list;
    Object c1(Object o) { return new BigDecimal(0.123456); }
    Object c2(Object o) { return new BigDecimal(1234.567); }
    Object c3(Object o) { return new BigDecimal(0.1234567); }
    Object c4(Object o) { return new BigDecimal(12345.6); }
    Object c5(Object o) { return new BigDecimal(123456.7); }
    Object c6(Object o) { return new BigDecimal(-123.456); }
    Object c7(Object o) { return new BigDecimal(-1234.567); }
    Object c8(Object o) { return new BigDecimal(-0.123456); }
    Object c9(Object o) { return new BigDecimal(1.234567); }
    Object c10(Object o) { return new BigDecimal(1.2345678); }
    Object c11(Object o) { return new BigDecimal(0.3); }
    Object c12(Object o) { return new BigDecimal(3.3); }
    Object c13(Object o) { return new BigDecimal(1000000.1); }
    Object c14(Object o) { return new BigDecimal(100000.1); }
    Object c15(Object o) { return new BigDecimal(0.000001); }
    Object c16(Object o) { return new BigDecimal(1.0E-3); }
    Object c17(Object o, int n) { return ll.get(o.hashCode() % n); }
    Object c18(Object o, int n) { return abl.get(o.hashCode() % n); }
    Object c19(Random r, int n) { return list.get(r.nextInt() % n); }
    Object c20(Object o, int n) { return list.get(Math.abs(o.hashCode()) % n); }
}
