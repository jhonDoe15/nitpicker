import static com.google.common.base.Preconditions.checkArgument;

import com.google.common.base.Ascii;
import com.google.common.flogger.FluentLogger;
import java.util.Arrays;

class S21FloggerArgs {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  public void f(String world, Object[] xs, long l, Integer boxed, double d, char c, float fl, boolean b, byte by, short sh) {
    logger.atInfo().log("hello '%s'", world.toString());
    logger.atInfo().log("hello %s %d", world.toString(), 2);
    logger.atInfo().log("hello %s", world.toUpperCase());
    logger.atInfo().log("hello %s", Ascii.toUpperCase(world));
    logger.atInfo().log("hello %s", Integer.toString(42));
    logger.atInfo().log("hello %d", Integer.valueOf(42));
    logger.atInfo().log("hello %s", Integer.toHexString(42));
    logger.atInfo().log("hello %S", Integer.toHexString(42));
    logger.atInfo().log("hello %s", Arrays.asList(1, 2));
    logger.atInfo().log("hello %s", Arrays.asList(xs));
    logger.atInfo().log("hello %s", Arrays.toString(xs));
    logger.atInfo().log("hello %s", Long.toHexString(l));
    logger.atInfo().log("%%s", Ascii.toUpperCase(world));
    logger.atInfo().log("%s", Double.toString(d));
    logger.atInfo().log("%s", Character.toString(c));
    logger.atInfo().log("%s", Float.valueOf(fl));
    logger.atInfo().log("%s", Boolean.toString(b));
    logger.atInfo().log("%s", Byte.valueOf(by));
    logger.atInfo().log("%s", Short.toString(sh));
    logger.atInfo().log("%s", Long.valueOf(l));
    logger.atInfo().log("%s", boxed.toString());
    logger.atInfo().log("%s", String.valueOf(l));
    logger.atInfo().log("%s", String.valueOf(xs));
    logger.atInfo().log("100%% %n %s %n", world.toString());
    logger.atInfo().log("100%s %5s %-5s", world.toString(), world.toString(), world.toString());
    logger.atInfo().log("%08d %s", 1, world.toString());
    logger.atInfo().log("%s %s", world.toString(), l);
    logger.atInfo().log("tab\t'%s' \"%s\" é", world.toString(), world);
    logger.atInfo().log("%s", (Object) world.toString());
    logger.atInfo().log("%y %s", world.toString());
    logger.atInfo().log("plain " + world, world.toString());
    logger.atInfo().log(world, world.toString());
    logger.atInfo().log("%s");
    logger.atInfo().log("%s", world);
    logger.atInfo().log("%s", Arrays.asList(xs, xs));
    logger.atInfo().log("%s", Integer.toString(42, 16));
    logger.atInfo().log("%s", Integer.valueOf("42"));
  }

  @Override
  public String toString() {
    logger.atInfo().log("hello '%s'", toString());
    logger.atInfo().log("hello '%s'", this.toString());
    return "x";
  }

  void lenient(Object x, long l, String s) {
    checkArgument(1 == 1, "%s", x.toString());
    checkArgument(1 == 1, "%s", Long.toString(l));
    checkArgument(1 == 1, "%s", String.valueOf(l));
    checkArgument(1 == 1, "%s", s.toUpperCase());
    checkArgument(1 == 1, "%s %s", Integer.valueOf(1), x.toString());
    checkArgument(x.toString().isEmpty(), "%s", s);
  }

  @SuppressWarnings("FloggerArgumentToString")
  void suppressed(String s) {
    logger.atInfo().log("hello %s", s.toString());
  }
}
