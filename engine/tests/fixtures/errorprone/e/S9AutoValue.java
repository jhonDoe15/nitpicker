package e;

import com.google.auto.value.AutoValue;

@AutoValue
abstract class S9AvOne {
  abstract String valueOne();

  abstract String valueTwo();

  static S9AvOne create(String valueOne, String valueTwo) {
    return new AutoValue_S9AvOne(valueTwo, valueOne);
  }

  static S9AvOne inexact(String valueOneArg, String valueTwoArg) {
    return new AutoValue_S9AvOne(valueTwoArg, valueOneArg);
  }

  static S9AvOne correct(String valueOne, String valueTwo) {
    return new AutoValue_S9AvOne(valueOne, valueTwo);
  }

  static S9AvOne partial(String valueOne, String other) {
    return new AutoValue_S9AvOne(other, valueOne);
  }

  static S9AvOne literal(String valueOne) {
    return new AutoValue_S9AvOne("x", valueOne);
  }

  @SuppressWarnings("AutoValueConstructorOrderChecker")
  static S9AvOne suppressed(String valueOne, String valueTwo) {
    return new AutoValue_S9AvOne(valueTwo, valueOne);
  }

  static S9AvOne parenthesized(String valueOne, String valueTwo) {
    return new AutoValue_S9AvOne((valueTwo), (valueOne));
  }

  static S9AvOne commented(String valueOne, String valueTwo) {
    return new AutoValue_S9AvOne(/* valueOne= */ valueTwo, /* valueTwo= */ valueOne);
  }
}

final class AutoValue_S9AvOne extends S9AvOne {
  AutoValue_S9AvOne(String valueOne, String valueTwo) {}

  String valueOne() {
    return null;
  }

  String valueTwo() {
    return null;
  }
}

@AutoValue
abstract class S9AvThree {
  abstract int first();

  abstract int second();

  abstract int third();

  static S9AvThree rotate(int first, int second, int third) {
    return new AutoValue_S9AvThree(second, third, first);
  }

  static S9AvThree swap(int first, int second, int third) {
    return new AutoValue_S9AvThree(third, second, first);
  }

  static S9AvThree fine(int first, int second, int third) {
    return new AutoValue_S9AvThree(first, second, third);
  }

  static S9AvThree mixed(int first, int second, int third) {
    return new AutoValue_S9AvThree(second, first, third);
  }

  static S9AvThree calls(S9AvThree other) {
    return new AutoValue_S9AvThree(other.second(), other.first(), other.third());
  }

  int first;
}

final class AutoValue_S9AvThree extends S9AvThree {
  AutoValue_S9AvThree(int first, int second, int third) {}

  int first() {
    return 0;
  }

  int second() {
    return 0;
  }

  int third() {
    return 0;
  }
}

abstract class S9AvPlain {
  S9AvPlain(String valueOne, String valueTwo) {}

  static S9AvPlain create(String valueOne, String valueTwo) {
    return new S9AvPlain(valueTwo, valueOne) {};
  }
}

class S9AvNotValue {
  S9AvNotValue(String valueOne, String valueTwo) {}

  static S9AvNotValue create(String valueOne, String valueTwo) {
    return new S9AvNotValue(valueTwo, valueOne);
  }
}

@AutoValue
abstract class S9AvTypes {
  abstract String name();

  abstract Object other();

  static S9AvTypes create(String other, Object name) {
    return new AutoValue_S9AvTypes(other, name);
  }
}

final class AutoValue_S9AvTypes extends S9AvTypes {
  AutoValue_S9AvTypes(String name, Object other) {}

  String name() {
    return null;
  }

  Object other() {
    return null;
  }
}

@AutoValue
abstract class S9AvDup {
  abstract String left();

  abstract String right();

  static S9AvDup create(String left, String right) {
    return new AutoValue_S9AvDup(right, left);
  }

  static S9AvDup other(String left, String right) {
    return new AutoValue_S9AvDup(right, left);
  }
}

final class AutoValue_S9AvDup extends S9AvDup {
  AutoValue_S9AvDup(String left, String right) {}

  String left() {
    return null;
  }

  String right() {
    return null;
  }
}
