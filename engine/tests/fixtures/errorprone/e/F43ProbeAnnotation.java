import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;
import java.util.List;

class F43ProbeAnnotation {
  static final String FIELD_CONSTANT = "%d";
  final String finalField = "%s";
  String mutableField = "%s";

  @FormatMethod
  static void log(String format, Object... args) {}

  @FormatMethod
  static void log2(@FormatString String format, int value) {}

  @FormatMethod
  static void typed(String format, List<String> values, int count) {
    log(format, values, count);
  }

  @FormatMethod
  static void typed2(String format, List<String> values) {
    log(format, values, 1);
  }

  @FormatMethod
  static void typed3(String format, Object[] values) {
    log(format, values);
  }

  @FormatMethod
  static void forwards(String format, Object... args) {
    log(format, args);
    log(format);
    log2(format, 1);
  }

  static void notFormat(String format, Object... args) {
    log(format, args);
  }

  @FormatMethod
  static void second(String first, @FormatString String format, Object... args) {
    log(first, args);
    log(format, args);
  }

  void calls(String parameter, Exception e) {
    log(FIELD_CONSTANT, "x");
    log(finalField, 1);
    log(mutableField, 1);
    log(parameter.trim(), 1);
    log(String.valueOf(1), 1);
    final String local = "%d";
    log(local, "x");
    String effectively = "%s";
    log(effectively, 1, 2);
    String reassigned = "%s";
    reassigned = "%d";
    log(reassigned, 1);
    String late;
    late = "%s";
    log(late, 1);
    String computed = parameter + "%s";
    log(computed, 1);
    final String nonConstant = String.valueOf(2);
    log(nonConstant, 1);
    for (String each : List.of("%s")) {
      log(each, 1);
    }
    try {
      log("x");
    } catch (RuntimeException caught) {
      log(caught.getMessage());
    }
    java.util.function.Consumer<String> consumer = format -> log(format, 1);
    log(true ? "%d" : parameter, "x");
    log(("%d"), "x");
    log2("%s %s", 1);
    new F43ProbeAnnotationCtor("%d", "x");
  }

  @FormatMethod
  void noString(int value) {}

  void misplaced(@FormatString String format) {}

  @FormatMethod
  void wrongType(@FormatString int format, String other) {}

  @FormatMethod
  void twice(@FormatString String a, @FormatString String b) {}
}

class F43ProbeAnnotationCtor {
  @FormatMethod
  F43ProbeAnnotationCtor(String format, Object... args) {}
}
