package e;

import com.google.common.flogger.FluentLogger;
import com.google.errorprone.annotations.CompileTimeConstant;

class S10Flogger {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();
  private static final String CONSTANT = "CONSTANT";
  private static final int NUMBER = 3;
  private static String notFinal = "x";
  private final String instanceFinal = "instance";
  private final String computedFinal;

  S10Flogger(String s) {
    computedFinal = s;
  }

  public void positive(String s) {
    logger.atInfo().log(s);
    logger.atInfo().log("foo " + s);
    logger.atInfo().log(notFinal);
    logger.atInfo().log(computedFinal);
    logger.atInfo().log(s.toString());
    logger.atInfo().log(String.valueOf(1));
    logger.atInfo().log(true ? s : "a");
    logger.atInfo().log(this.instanceFinal);
  }

  public void negative(@CompileTimeConstant String s) {
    final String localFinal = "localFinal";
    logger.atInfo().log("hello");
    logger.atInfo().log(s);
    logger.atInfo().log(CONSTANT);
    logger.atInfo().log(localFinal);
    logger.atInfo().log("hello " + s);
    logger.atInfo().log("hello " + CONSTANT);
    logger.atInfo().log("hello " + localFinal);
    logger.atInfo().log("hello " + s + CONSTANT);
    logger.atInfo().log("hello " + s + localFinal);
    logger.atInfo().log("hello " + localFinal + CONSTANT);
    logger.atInfo().log("hello " + s + localFinal + CONSTANT);
    logger.atInfo().log(s + localFinal);
    logger.atInfo().log(s + CONSTANT);
    logger.atInfo().log(CONSTANT + localFinal);
    logger.atInfo().log(s + localFinal + CONSTANT);
    logger.atInfo().log((String) null);
    logger.atInfo().log(null);
    logger.atInfo().log("a" + NUMBER);
    logger.atInfo().log(("hello"));
    logger.atInfo().log(true ? "a" : "b");
    logger.atInfo().log(true ? s : CONSTANT);
    logger.atInfo().log(S10Flogger.CONSTANT);
    logger.atInfo().log("%s", notFinal);
    logger.atInfo().log();
    logger.atInfo().log((String) "cast");
    logger.atInfo().log(this.instanceFinal);
    logger.atInfo().log(instanceFinal);
  }

  @SuppressWarnings("FloggerLogString")
  void suppressed(String s) {
    logger.atInfo().log(s);
  }
}

class S10FloggerFields {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();
  @CompileTimeConstant private final String annotatedFinal;
  @CompileTimeConstant private String annotatedNonFinal;
  @CompileTimeConstant private static final String ANNOTATED_STATIC = "x";
  @CompileTimeConstant static String annotatedStaticNonFinal = "x";
  static final String COMPUTED_STATIC = System.getProperty("x");
  static final String STATIC_FROM_CONSTANTS = S10Flogger.class.getName();
  static final String STATIC_CONCAT = "a" + "b";
  final String instanceConstant = "i";
  final String instanceConcat = "i" + "j";
  final int instanceNumber = 4;
  final String computed = String.valueOf(1);
  static final Object OBJECT = "o";
  static final String[] ARRAY = {"a"};
  static final char CHARACTER = 'c';
  static final boolean FLAG = true;
  static final long LONG = 1L;
  static final double DOUBLE = 1.0;
  S10FloggerFields other;
  S10FloggerFields next;

  S10FloggerFields(String s) {
    annotatedFinal = s;
  }

  void fields(String s) {
    logger.atInfo().log(annotatedFinal);
    logger.atInfo().log(this.annotatedFinal);
    logger.atInfo().log(other.annotatedFinal);
    logger.atInfo().log(annotatedNonFinal);
    logger.atInfo().log(this.annotatedNonFinal);
    logger.atInfo().log(ANNOTATED_STATIC);
    logger.atInfo().log(S10FloggerFields.ANNOTATED_STATIC);
    logger.atInfo().log(annotatedStaticNonFinal);
    logger.atInfo().log(S10FloggerFields.annotatedStaticNonFinal);
    logger.atInfo().log(COMPUTED_STATIC);
    logger.atInfo().log(S10FloggerFields.COMPUTED_STATIC);
    logger.atInfo().log(STATIC_FROM_CONSTANTS);
    logger.atInfo().log(STATIC_CONCAT);
    logger.atInfo().log(S10FloggerFields.STATIC_CONCAT);
    logger.atInfo().log(instanceConstant);
    logger.atInfo().log(this.instanceConstant);
    logger.atInfo().log(other.instanceConstant);
    logger.atInfo().log(instanceConcat);
    logger.atInfo().log("n" + instanceNumber);
    logger.atInfo().log(computed);
    logger.atInfo().log(String.valueOf(CHARACTER));
    logger.atInfo().log("" + CHARACTER + FLAG + LONG + DOUBLE);
    logger.atInfo().log(annotatedFinal + "x");
    logger.atInfo().log(annotatedFinal + s);
    logger.atInfo().log(other.next.annotatedFinal);
    logger.atInfo().log(S10Flogger.class.getName());
    logger.atInfo().log((annotatedFinal));
    logger.atInfo().log(true ? annotatedFinal : ANNOTATED_STATIC);
    logger.atInfo().log(true ? annotatedFinal : annotatedNonFinal);
    logger.atInfo().log(String.valueOf(ANNOTATED_STATIC));
    logger.atInfo().log(ANNOTATED_STATIC.toString());
    logger.atInfo().log(com.google.common.collect.ImmutableList.of(annotatedFinal).toString());
  }

  void locals(String s, @CompileTimeConstant String p, @CompileTimeConstant final String q) {
    String effectivelyFinal = "e";
    String reassigned = "r";
    reassigned = "t";
    final String finalComputed = s;
    final String finalAnnotated = p;
    logger.atInfo().log(effectivelyFinal);
    logger.atInfo().log(reassigned);
    logger.atInfo().log(finalComputed);
    logger.atInfo().log(finalAnnotated);
    logger.atInfo().log(q);
    logger.atInfo().log(p + q);
    p = "changed";
    logger.atInfo().log(p);
    logger.atInfo().log(q + p);
  }
}

class S10FloggerMore {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();
  final char letter = 'c';
  final boolean flag = true;
  final long number = 5L;
  final double ratio = 1.5;
  final String viaOther = S10Flogger.class.getName();
  static final String STATIC_REF = "s";
  static final String STATIC_CHAIN = STATIC_REF + "t";
  final String instanceChain = STATIC_REF + "u";

  void more() {
    logger.atInfo().log("" + letter + flag);
    logger.atInfo().log("" + number);
    logger.atInfo().log("" + ratio);
    logger.atInfo().log(viaOther);
    logger.atInfo().log(STATIC_CHAIN);
    logger.atInfo().log(instanceChain);
    logger.atInfo().log(S10FloggerFields.STATIC_CONCAT);
    logger.atInfo().log(S10Flogger.class.getSimpleName() + "x");
  }
}
