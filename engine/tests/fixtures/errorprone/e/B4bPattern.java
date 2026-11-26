package e;

import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class B4bPattern {
  static class LocalPlain {
    void run(String input) {
      Pattern p = Pattern.compile("x+");
      p.matcher(input).matches();
    }
  }

  static class LocalShortName {
    static void run(String input) {
      Pattern p = Pattern.compile("y+");
      Matcher m = p.matcher(input);
    }
  }

  static class LocalUseName {
    static void run(String input) {
      Pattern p = Pattern.compile("z+");
      p.matcher(input).find();
    }
  }

  static class LocalLongName {
    static void run(String lineText) {
      Pattern pattern = Pattern.compile("w+");
      pattern.matcher(lineText).find();
    }
  }

  static class LocalNoUse {
    static void run(String input) {
      Pattern p = Pattern.compile("q+");
      System.out.println(p + input);
    }
  }

  static class LocalMethodArg {
    static void run(String input) {
      Pattern p = Pattern.compile("r+");
      p.matcher(input.trim()).find();
    }
  }

  static class FromRegexName {
    static final String PUBLIC_REGEX = "c+";
    static void run() {
      Pattern p = Pattern.compile(PUBLIC_REGEX);
      System.out.println(p);
    }
  }

  static class FromRegexSuffix {
    static final String USED_REGEX = "b+";
    static void run() {
      Pattern p = Pattern.compile(USED_REGEX);
      System.out.println(p);
    }
  }

  static class FromPatternSuffix {
    static final String A_PATTERN = "b+";
    static void run() {
      Pattern p = Pattern.compile(A_PATTERN);
      System.out.println(p);
    }
  }

  static class ConstantReplaced {
    private static final String FIRST_REGEX = "a+";
    static void run(String input) {
      Pattern p = Pattern.compile(FIRST_REGEX);
      p.matcher(input).find();
    }
  }

  static class ConstantTwice {
    private static final String TWICE = "b+";
    static void run(String input) {
      Pattern p = Pattern.compile(TWICE);
      p.matcher(input).find();
      System.out.println(TWICE);
    }
  }

  static class InstanceMethod {
    void run(String input) {
      Pattern someLongName = Pattern.compile("i+");
      someLongName.matcher(input).find();
    }
  }

  class InnerMethod {
    void run(String input) {
      Pattern someLongName = Pattern.compile("i+");
      someLongName.matcher(input).find();
    }
  }

  static class InlineMatcher {
    void run(String input) {
      boolean b = Pattern.compile("m+").matcher(input).matches();
    }
  }

  static class InlineMatcherNames {
    void run(String lineInput) {
      boolean b = Pattern.compile("n+").matcher(lineInput).matches();
      boolean c = Pattern.compile("o+").matcher(lineInput).matches();
      boolean d = Pattern.compile("o+").matcher(lineInput.trim()).matches();
      boolean e = Pattern.compile("o+").matcher(lineInput.trim()).matches();
    }
  }

  static class Assigned {
    void run(String input) {
      Pattern p;
      p = Pattern.compile("assigned");
    }
  }

  static class Predicates {
    void run(String input) {
      Predicate<String> pred = Pattern.compile("pred").asMatchPredicate();
    }
  }

  static class Returned {
    Pattern run() {
      return Pattern.compile("ret");
    }
  }

  static class Flags {
    Pattern run() {
      return Pattern.compile("flag", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    }
  }

  static class FlagsConstant {
    private static final int FLAGS = Pattern.CASE_INSENSITIVE;
    Pattern run() {
      return Pattern.compile("flag2", FLAGS);
    }
  }

  static class NotConstants {
    final String instanceRegex = "d+";
    void run(String input, int flags) {
      Pattern a = Pattern.compile(input);
      Pattern b = Pattern.compile("x", flags);
      Pattern c = Pattern.compile(instanceRegex);
      Pattern d = Pattern.compile(input + "x");
    }
  }

  static class Fields {
    static final Pattern FIELD = Pattern.compile("field");
    Pattern instanceField = Pattern.compile("instance field");
  }

  static class StaticBlock {
    static {
      Pattern init = Pattern.compile("init");
    }
  }

  static class AnonInConstant {
    static final Object ANON = new Object() {
      Pattern p() { return Pattern.compile("anon in constant"); }
    };
  }

  static class LambdaConstant {
    static final Predicate<String> LAMBDA = s -> Pattern.compile("lambda").matcher(s).matches();
  }

  static class LambdaField {
    Predicate<String> instanceLambda = s -> Pattern.compile("instance lambda").matcher(s).matches();
  }

  static class Anonymous {
    void run(String input) {
      Object o = new Object() {
        void inside() {
          Pattern p = Pattern.compile("anonymous");
        }
      };
    }
  }

  static class AnonymousField {
    void run(String input) {
      Object o = new Object() {
        Pattern p = Pattern.compile("anonymous field");
      };
    }
  }

  static class LambdaLocal {
    void run() {
      Runnable r = () -> {
        Pattern p = Pattern.compile("lambda local");
        p.matcher("").find();
      };
    }
  }

  static class Suppressed {
    @SuppressWarnings("ConstantPatternCompile")
    void run() {
      Pattern p = Pattern.compile("suppressed");
    }
  }

  static class SuppressedClass {
    void run() {
      Pattern p = Pattern.compile("suppressed one");
    }
    @SuppressWarnings("ConstantPatternCompile")
    void other() {
      Pattern p = Pattern.compile("suppressed two");
    }
  }

  enum Color {
    RED(Pattern.compile("red")),
    GREEN(Pattern.compile("green"));
    final Pattern pattern;
    Color(Pattern pattern) { this.pattern = pattern; }
    Pattern make() { return Pattern.compile("enum method"); }
  }

  interface Api {
    default Pattern make() { return Pattern.compile("default method"); }
  }

  record Rec(String s) {
    Pattern make() { return Pattern.compile("record method"); }
  }

  static class Twice {
    void run() {
      Pattern a = Pattern.compile("two");
      Pattern b = Pattern.compile("two");
      System.out.println(a + " " + b);
    }
  }

  static class Mixed {
    void run(String input) {
      Pattern a = Pattern.compile("mixed a");
      System.out.println(a + input);
      boolean b = Pattern.compile("mixed b").matcher(input).matches();
    }
  }

  static class ConstructorCase {
    ConstructorCase(String input) {
      Pattern p = Pattern.compile("ctor");
      p.matcher(input).find();
    }
  }

  static class ForInit {
    void run(String input) {
      for (Pattern p = Pattern.compile("for"); input.isEmpty();) {
        p.matcher(input).find();
      }
    }
  }

  static class FullName {
    void run(String input) {
      java.util.regex.Pattern p = java.util.regex.Pattern.compile("full");
      p.matcher(input).find();
    }
  }

  static class VarLocal {
    void run(String input) {
      var p = Pattern.compile("var");
      p.matcher(input).find();
    }
  }

  static class Shadowed {
    static class Pattern {}
    Object run(String input) {
      return java.util.regex.Pattern.compile("shadow").matcher(input);
    }
  }
}
