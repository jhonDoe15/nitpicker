package e;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

class B5Streams {
  long chained(Path path) throws IOException {
    return Files.lines(path).count();
  }

  long variable(Path path) throws IOException {
    long count = Files.lines(path).count();
    return count;
  }

  void statement(Path path) throws IOException {
    Files.lines(path).forEach(System.out::println);
  }

  void filtered(Path path) throws IOException {
    Files.lines(path).filter(line -> !line.isEmpty()).map(String::trim).forEach(System.out::println);
  }

  Stream<String> returned(Path path) throws IOException {
    return Files.lines(path);
  }

  Stream<Path> conditional(Path path, boolean flag) throws IOException {
    return flag ? Files.list(path) : Files.walk(path);
  }

  void assigned(Path path) throws IOException {
    Stream<String> lines;
    lines = Files.lines(path);
    lines.close();
  }

  void declared(Path path) throws IOException {
    Stream<Path> stream = Files.walk(path);
    stream.forEach(System.out::println);
    System.out.println("done");
  }

  void loop(Path path) throws IOException {
    for (Path entry : Files.newDirectoryStream(path)) {
      System.out.println(entry);
    }
  }

  void inArgument(Path path) throws IOException {
    System.out.println(Files.find(path, 2, (p, a) -> true));
  }

  void inCollect(Path path) throws IOException {
    List<String> all = Files.lines(path).collect(Collectors.toList());
  }

  void tryWith(Path path) throws IOException {
    try (Stream<String> lines = Files.lines(path)) {
      lines.forEach(System.out::println);
    }
  }

  void finallyClosed(Path path) throws IOException {
    final Stream<String> lines = Files.lines(path);
    try {
      lines.forEach(System.out::println);
    } finally {
      lines.close();
    }
  }

  @SuppressWarnings("StreamResourceLeak")
  void suppressed(Path path) throws IOException {
    Files.lines(path).count();
  }

  void two(Path path) throws IOException {
    Files.lines(path).count();
    Files.list(path).count();
  }

  void lambda(Path path) {
    Runnable run = () -> {
      try {
        Files.lines(path).count();
      } catch (IOException e) {
      }
    };
  }

  DirectoryStream<Path> directory(Path path) throws IOException {
    return Files.newDirectoryStream(path);
  }
}
