import com.google.common.flogger.FluentLogger;

class S20Flogger {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();
  private static final String FORMAT_STRING = "hello {0}";
  private static final String CONSTANT = "constant";

  void messageFormat(Exception e) {
    logger.atInfo().log("hello {0}");
    logger.atInfo().log("hello {0}", "world");
    logger.atInfo().log("" + "hello {0}", "world");
    logger.atInfo().log(FORMAT_STRING, "world");
    logger.atInfo().log("hello %s", "world");
    logger.atInfo().log();
    logger.atInfo().log("{0} and {1} and {12} {a} {}");
    logger.atInfo().log("{9}\t\"q\" \u00e9 {5}");
    logger.atInfo().log("braces { 0 }");
    logger.atInfo().log(String.valueOf(1) + "{0}");
  }

  @SuppressWarnings("FloggerMessageFormat")
  void suppressedFormat() {
    logger.atInfo().log("hello {0}");
  }

  void concatenation(String world, int i, long l, float f, double d, boolean b, Integer boxed, Object o, char c, short s) {
    logger.atInfo().log("hello " + world + i + l + f + (d + "" + b) + CONSTANT);
    logger.atInfo().log(CONSTANT + "hello");
    logger.atInfo().log("hello " + world + " " + (i - 1));
    logger.atInfo().log(i + l + " sum; mean " + (i + l) / 2);
    logger.atInfo().log("message is %s " + world, world);
    logger.atInfo().log();
    logger.atInfo().log("plain");
    logger.atInfo().log(world);
    logger.atInfo().log(world + 'x');
    logger.atInfo().log("it's " + world + " \"quoted\"\n" + boxed + o + c + s);
    logger.atInfo().log(("paren " + world) + "!");
    logger.atInfo().log("a" + (world + "b") + i);
    logger.atInfo().log("x" + world, world);
    logger.atInfo().log("100% " + world + "é");
    logger.atInfo().log(world + "a" + "b");
    logger.atInfo().log(1 + 2 + world);
    logger.atInfo().log(String.valueOf(i) + world);
    logger.atInfo().log(i > 0 ? "a" + world : "b");
    logger.atInfo().log("tab\t" + world);
    logger.atInfo().log("back\\slash " + world);
  }

  @SuppressWarnings("FloggerStringConcatenation")
  void suppressedConcat(String world) {
    logger.atInfo().log("hello " + world);
  }
}
