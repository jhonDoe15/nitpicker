package shop.regexloops;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

public class Cleaner {
  private static final String DIGITS = "\\d+";
  private static final String PLAIN = "abc";
  private static final String JOINED = "a" + "b";
  private static final String DOTTED = "a" + ".";
  private static final Pattern DATED = Pattern.compile("\\d{4}-\\d{2}-\\d{2}.*");

  public List<String> dated(List<String> lines) {
    List<String> dated = new ArrayList<>();
    for (String line : lines) {
      if (line.matches("\\d{4}-\\d{2}-\\d{2}.*")) { // violation: RegexCompiledInLoop
        dated.add(line.replaceAll("\\s+", " ")); // violation: RegexCompiledInLoop
      }
    }
    return dated;
  }

  public String trimHeads(List<String> lines) {
    StringBuilder out = new StringBuilder();
    int index = 0;
    while (index < lines.size()) {
      out.append(lines.get(index).replaceFirst("^#{1,6}\\s*", "")); // violation: RegexCompiledInLoop
      index++;
    }
    return out.toString();
  }

  public List<String> squeeze(List<String> lines) {
    return lines.stream().map(line -> line.replaceAll("\\s+", " ")).toList(); // violation: RegexCompiledInLoop
  }

  public boolean anyWord(List<String> words) {
    return words.stream().anyMatch(word -> Pattern.matches(".*[a-z].*", word)); // violation: RegexCompiledInLoop
  }

  public int countDated(List<String> lines) {
    int total = 0;
    do {
      total++;
    } while (total < lines.size() && lines.get(total).matches(".*\\d.*")); // violation: RegexCompiledInLoop
    return total;
  }

  public int[] counts(List<String> lines) {
    int[] result = new int[lines.size()];
    for (int i = 0; i < lines.size(); i++) {
      result[i] = lines.get(i).replaceAll("[aeiou]", "").length(); // violation: RegexCompiledInLoop
    }
    return result;
  }

  public String once(String line) {
    return line.replaceAll("\\s+", " ");
  }

  public String headerOnly(List<String> lines) {
    for (String line : lines.get(0).replaceAll("\\s+", " ").split(",")) {
      return line;
    }
    return "";
  }

  public List<String> plain(List<String> lines) {
    List<String> out = new ArrayList<>();
    for (String line : lines) {
      out.add(line.replaceAll("abc", "x")); // violation: PlainTextRegex
      out.add(line.replaceAll(PLAIN, "y")); // violation: PlainTextRegex
      out.add(line.replace("a.c", "z"));
      out.add(String.join(",", line.split(",")));
    }
    return out;
  }

  public List<String> runtimePattern(List<String> lines, String pattern) {
    List<String> out = new ArrayList<>();
    for (String line : lines) {
      out.add(line.replaceAll(pattern, "")); // violation: UnquotedRegexValue
    }
    return out;
  }

  public List<String> precompiled(List<String> lines) {
    List<String> out = new ArrayList<>();
    for (String line : lines) {
      if (DATED.matcher(line).matches()) {
        out.add(line);
      }
    }
    return out;
  }

  public int initOnly(String text) {
    int total = 0;
    for (String s = text.replaceAll("\\s+", " "); total < s.length(); total++) {
      total += s.length();
    }
    return total;
  }

  public int initInLoop(List<String> lines) {
    int total = 0;
    for (String line : lines) {
      for (String s = line.replaceAll("\\s+", " "); total < s.length(); total++) { // violation: RegexCompiledInLoop
        total += 2;
      }
    }
    return total;
  }

  public long numeric(List<String> lines) {
    return lines.stream().filter(line -> line.matches(DIGITS)).count(); // violation: RegexCompiledInLoop
  }

  public List<String> constantPattern(List<String> lines) {
    return lines.stream().map(line -> line.replaceAll(DIGITS, "#")).toList(); // violation: RegexCompiledInLoop
  }

  public String qualifiedPlain(String line) {
    return line.replaceAll(Cleaner.PLAIN, "q"); // violation: PlainTextRegex
  }

  public String joined(String line) {
    return line.replaceAll(JOINED, "j"); // violation: PlainTextRegex
  }

  public String dotted(String line) {
    return line.replaceAll(DOTTED, "d");
  }
}
