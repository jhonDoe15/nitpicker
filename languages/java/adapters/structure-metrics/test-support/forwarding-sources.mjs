export const JAVA_ALIASES = `package demo;
class Aliases {
  int target(int value) { return value + 1; }
  int alias(int value) { return target(value); }
  int explicit(int value) { return this.target(value); }
  void sink(int value) { System.out.println(value); }
  void passVoid(int value) { sink(value); }
  @Deprecated int compatibility(int value) { return target(value); }
  /** @deprecated use target */
  int oldAlias(int value) { return target(value); }
  String describe() { return "price"; }
  public String toString() { return describe(); }
  int of(int value) { return target(value); }
  long adapted(int value) { return target(value); }
  int changed(int value) { return target(value + 1); }
  int recursive(int value) { return recursive(value); }
  static int staticAlias(int value) { return Helper.target(value); }
  int instance(int value) { return new Helper().target(value); }
  int overloaded(int value) { return value; }
  int overloaded(String value) { return value.length(); }
  int over(int value) { return overloaded(value); }
  <T> T generic(T value) { return value; }
  String genericAlias(String value) { return generic(value); }
  int vararg(int... value) { return value.length; }
  int spreading(int[] value) { return vararg(value); }
  int zeroTarget() { return 1; }
  int zero() { return this.zeroTarget(); }
  synchronized int locked(int value) { return target(value); }
  int checked(int value) throws Exception { return target(value); }
  void discarded(int value) { target(value); }
}
class Helper { static int target(int value) { return value; } }
class Derived extends Aliases {
  @Override int alias(int value) { return target(value); }
}
interface Contract { int alias(int value); }
class Implementation implements Contract {
  public int alias(int value) { return target(value); }
  int target(int value) { return value; }
}
`;
