package guards;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public final class Streams {
  public List<String> upper(List<String> names) {
    return names.stream().map(String::trim).collect(Collectors.toList()); // violation: pmd/CollectorsToList
  }

  public Map<Integer, List<String>> byLength(List<String> names) {
    return names.stream().collect(Collectors.groupingBy(String::length, Collectors.toList()));
  }

  public List<String> copy(List<String> names) {
    List<String> result = new ArrayList<>();
    names.forEach(name -> result.add(name)); // violation: pmd/ForEachSideEffect
    return names.stream().map(String::strip).toList();
  }

  public long count(Path file) throws IOException {
    return Files.lines(file).count(); // violation: pmd/StreamResourceNotClosed
  }

  public long countClosed(Path file) throws IOException {
    try (Stream<String> lines = Files.lines(file)) {
      return lines.count();
    }
  }

  public long countDeclared(Path file) throws IOException {
    Stream<String> lines = Files.lines(file);
    try (lines) {
      return lines.count();
    }
  }

  public Stream<String> open(Path file) throws IOException {
    return Files.lines(file);
  }
}
