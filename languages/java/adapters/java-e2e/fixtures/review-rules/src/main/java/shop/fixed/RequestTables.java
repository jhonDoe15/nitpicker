package shop.fixed;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

public final class RequestTables {
  public record Entry(String name, String value) {}

  public static Map<String, String> cookies(HttpServletRequest request) {
    return Arrays.stream(request.getCookies())
        .collect(Collectors.toMap(Cookie::getName, Cookie::getValue)); // violation: ToMapDuplicateKey
  }

  public static Map<String, String> cookiesByLambda(List<Cookie> cookies) {
    return cookies.stream()
        .collect(Collectors.toMap(c -> c.getName(), c -> c.getValue())); // violation: ToMapDuplicateKey
  }

  public static Map<String, String> settings(String line) {
    return Arrays.stream(line.split(";"))
        .map(part -> part.split("=", 2))
        .collect(Collectors.toMap(pair -> pair[0], pair -> pair[1])); // violation: ToMapDuplicateKey
  }

  public static Map<String, String> firstCookie(HttpServletRequest request) {
    return Arrays.stream(request.getCookies())
        .collect(Collectors.toMap(Cookie::getName, Cookie::getValue, (first, second) -> first));
  }

  public static Map<String, List<String>> allCookies(HttpServletRequest request) {
    return Arrays.stream(request.getCookies())
        .collect(Collectors.groupingBy(Cookie::getName, Collectors.mapping(Cookie::getValue, Collectors.toList())));
  }

  public static Map<String, Entry> byName(List<Entry> entries) {
    return entries.stream().collect(Collectors.toMap(Entry::name, entry -> entry));
  }

  public static Map<Integer, String> numbered(Stream<String> names) {
    return names.collect(Collectors.toMap(String::length, name -> name, (first, second) -> second));
  }

  public static Map<String, String> distinctCookies(Cookie[] cookies) {
    return Arrays.stream(cookies)
        .distinct()
        .collect(Collectors.toMap(Cookie::getName, Cookie::getValue));
  }

  public static Map<String, String> setCookies(Set<Cookie> cookies) {
    return cookies.stream()
        .collect(Collectors.toMap(Cookie::getName, Cookie::getValue));
  }

  public static Map<String, String> sortedCookies(List<Cookie> cookies) {
    return new TreeSet<>(cookies).stream()
        .collect(Collectors.toMap(Cookie::getName, Cookie::getValue));
  }

  public static Map<String, String> collectedCookies(Cookie[] cookies) {
    return Arrays.stream(cookies)
        .collect(Collectors.toCollection(TreeSet::new)).stream()
        .collect(Collectors.toMap(Cookie::getName, Cookie::getValue));
  }

  public static Map<String, String> indexedCookies(Cookie[] cookies) {
    return IntStream.range(0, cookies.length)
        .mapToObj(i -> cookies[i])
        .collect(Collectors.toMap(Cookie::getName, Cookie::getValue));
  }
}
