package shop.patterns;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class KeywordScans {
  private static final Pattern CASE_LABEL = Pattern.compile("\\bcase\\b");
  private static final Pattern WORD = Pattern.compile("\\bcart\\b");

  private KeywordScans() {}

  public static int caseLabels(String source) {
    Matcher matcher = CASE_LABEL.matcher(source); // violation: KeywordRegexOverSource
    int count = 0;
    while (matcher.find()) {
      count++;
    }
    return count;
  }

  public static boolean importsAnything(String sourceCode) {
    return Pattern.compile("\\bimport\\b").matcher(sourceCode).find(); // violation: KeywordRegexOverSource
  }

  public static String hideRequires(String sourceText) {
    return sourceText.replaceAll("\\brequire\\(", "load("); // violation: KeywordRegexOverSource
  }

  public static int caseLabelsOfCode(String source) {
    String code = stripCommentsAndStrings(source);
    Matcher matcher = CASE_LABEL.matcher(code);
    int count = 0;
    while (matcher.find()) {
      count++;
    }
    return count;
  }

  public static boolean mentionsCart(String source) {
    return WORD.matcher(source).find();
  }

  public static boolean describesCase(String description) {
    return CASE_LABEL.matcher(description).find();
  }

  private static String stripCommentsAndStrings(String source) {
    return source.replaceAll("//[^\n]*", "");
  }
}
