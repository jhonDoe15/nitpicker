package e;

import com.google.common.base.Joiner;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public abstract class S14StreamToString implements Stream<String> {
  public String own() {
    return toString();
  }

  void positive() {
    System.err.println(Arrays.asList(42).stream());
    Arrays.asList(42).stream().toString();
    String.valueOf(Arrays.asList(42).stream());
    String s = "" + Arrays.asList(42).stream();
    String t = String.format("%s", Arrays.asList(42).stream());
    StringBuilder builder = new StringBuilder().append(Stream.of(1));
  }

  void negative() {
    System.err.println(Arrays.asList(42).stream().map(String::valueOf).collect(Collectors.joining(", ")));
    String.valueOf(Arrays.asList(42).stream().map(String::valueOf).collect(Collectors.joining(", ")));
    String s = "" + Arrays.asList(42).stream().map(String::valueOf).collect(Collectors.joining(", "));
    String.format("%s %s", null, null);
    String.valueOf(Arrays.asList(42).stream().mapToInt(x -> x));
  }

  void joiner(Stream<String> xs, Joiner j, List<Stream<String>> list) {
    var x = Joiner.on("foo").join(xs, xs);
    var y = Joiner.on("foo").join(null, null, new Stream[] {xs});
    j.join(list);
  }

  @SuppressWarnings("StreamToString")
  void suppressed(Stream<String> xs) {
    System.err.println(xs);
  }
}
