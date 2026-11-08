package guards;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
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
    names.stream().forEach(name -> result.add(name)); // violation: pmd/ForEachSideEffect
    names.forEach(name -> result.add(name));
    names.forEach(result::add);
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

  public Stream<String> trimmed(Path file) throws IOException {
    return Files.lines(file).map(String::trim);
  }

  public Callable<Stream<String>> lazy(Path file) {
    return () -> Files.lines(file);
  }

  public Stream<String> allLines(Stream<Path> files) {
    return files.flatMap(
        file -> {
          try {
            return Files.lines(file);
          } catch (IOException e) {
            throw new IllegalStateException(e);
          }
        });
  }

  public long countMapped(Path file) throws IOException {
    Stream<String> lines = Files.lines(file).map(String::trim);
    try (lines) {
      return lines.count();
    }
  }

  public long countFinally(Path file) throws IOException {
    Stream<String> lines;
    lines = Files.lines(file);
    try {
      return lines.count();
    } finally {
      lines.close();
    }
  }

  public long countChained(Path file) throws IOException {
    return Files.lines(file).count(); // violation: pmd/StreamResourceNotClosed
  }

  public Stream<String> leaked(Path file) throws IOException {
    Stream<String> lines = Files.lines(file).map(String::trim); // violation: pmd/StreamResourceNotClosed
    return lines.filter(String::isEmpty);
  }
}
