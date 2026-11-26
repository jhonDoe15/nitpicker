package repeats;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class Reads {
  static String read(Path path) {
    try {
      return Files.readString(path);
    } catch (IOException problem) {
      throw new UncheckedIOException(problem);
    }
  }

  int all(List<Path> paths) throws IOException {
    List<String> texts = new ArrayList<>();
    for (Path path : paths) {
      texts.add(Files.readString(path));
    }
    int total = 0;
    for (String text : texts) {
      total += text.length();
    }
    return total;
  }

  int bytes(List<Path> paths) throws IOException {
    List<byte[]> contents = new ArrayList<>();
    for (Path path : paths) {
      contents.add(Files.readAllBytes(path));
    }
    int total = 0;
    for (byte[] content : contents) {
      total += content.length;
    }
    return total + contents.size();
  }

  int streamed(List<Path> paths) {
    List<String> texts = paths.stream().map(Reads::read).toList();
    int total = 0;
    for (String text : texts) {
      total += text.length();
    }
    return total;
  }

  int lines(List<Path> paths) throws IOException {
    List<List<String>> files = new ArrayList<>();
    for (Path path : paths) {
      files.add(Files.readAllLines(path));
    }
    int total = 0;
    for (List<String> file : files) {
      total += file.size();
    }
    return total;
  }

  List<String> kept(List<Path> paths) throws IOException {
    List<String> texts = new ArrayList<>();
    for (Path path : paths) {
      texts.add(Files.readString(path));
    }
    for (String text : texts) {
      System.out.println(text);
    }
    return texts;
  }

  int oneAtATime(List<Path> paths) throws IOException {
    int total = 0;
    for (Path path : paths) {
      total += Files.readString(path).length();
    }
    return total;
  }
}
