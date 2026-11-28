package p;
import java.util.*;
public class D {
  static Object make() { return new Object(); }
  static int num() { return 3; }
  static long lnum() { return 3; }
  void a00() {
    int x = num();
    int y = x;
  }
  void b00(int x) {
    int y = x;
  }
  void a01() {
    long x = lnum();
    long y = x;
  }
  void b01(long x) {
    long y = x;
  }
  void a02() {
    double x = 1.5*num();
    double y = x;
  }
  void b02(double x) {
    double y = x;
  }
  void a03() {
    boolean x = num()>1;
    boolean y = x;
  }
  void b03(boolean x) {
    boolean y = x;
  }
  void a04() {
    String x = String.valueOf(num());
    String y = x;
  }
  void b04(String x) {
    String y = x;
  }
  void a05() {
    Object x = make();
    Object y = x;
  }
  void b05(Object x) {
    Object y = x;
  }
  void a06() {
    Integer x = Integer.valueOf(num());
    Integer y = x;
  }
  void b06(Integer x) {
    Integer y = x;
  }
  void a07() {
    List<String> x = new ArrayList<String>();
    List<String> y = x;
  }
  void b07(List<String> x) {
    List<String> y = x;
  }
  void a08() {
    CharSequence x = String.valueOf(num());
    CharSequence y = x;
  }
  void b08(CharSequence x) {
    CharSequence y = x;
  }
  void a09() {
    Object x = String.valueOf(num());
    Object y = x;
  }
  void b09(Object x) {
    Object y = x;
  }
  void a10() {
    String x = (String) make();
    String y = x;
  }
  void b10(String x) {
    String y = x;
  }
  void a11() {
    char x = (char) num();
    char y = x;
  }
  void b11(char x) {
    char y = x;
  }
  void a12() {
    short x = (short) num();
    short y = x;
  }
  void b12(short x) {
    short y = x;
  }
  void a13() {
    byte x = (byte) num();
    byte y = x;
  }
  void b13(byte x) {
    byte y = x;
  }
  void a14() {
    float x = (float) num();
    float y = x;
  }
  void b14(float x) {
    float y = x;
  }
}
