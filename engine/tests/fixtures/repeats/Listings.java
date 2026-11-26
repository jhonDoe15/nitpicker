package repeats;

import java.io.File;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.NavigableSet;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Stream;

public class Listings {
  void streams(Path dir) throws IOException {
    try (Stream<Path> entries = Files.list(dir)) {
      entries.filter(Files::isRegularFile).forEach(System.out::println);
    }
    try (Stream<Path> entries = Files.walk(dir)) {
      System.out.println(entries.mapToLong(entry -> {
        try {
          return Files.size(entry);
        } catch (IOException problem) {
          return 0;
        }
      }).sum());
    }
    try (Stream<Path> entries = Files.list(dir)) {
      entries.map(Path::getFileName).forEach(System.out::println);
    }
    try (Stream<Path> found = Files.find(dir, 1, (path, attributes) -> attributes.isRegularFile())) {
      found.forEach(System.out::println);
    }
  }

  void loops(Path dir, File folder, List<Path> known) throws IOException {
    try (DirectoryStream<Path> entries = Files.newDirectoryStream(dir)) {
      for (Path entry : entries) {
        if (Files.isDirectory(entry)) {
          System.out.println(entry);
        }
      }
    }
    for (File file : folder.listFiles()) {
      if (file.isFile() && file.length() > 10) {
        System.out.println(file.getName());
      }
    }
    File[] children = folder.listFiles();
    System.out.println(Arrays.stream(children).filter(File::isDirectory).count());
    for (Path path : known) {
      if (Files.isDirectory(path)) {
        System.out.println(path);
      }
    }
    for (File file : folder.listFiles()) {
      System.out.println(file.getName());
    }
  }

  int firstBetween(NavigableSet<Integer> marks, int low, int high) {
    for (int mark : marks) {
      if (mark >= low && mark <= high) {
        return mark;
      }
    }
    return -1;
  }

  boolean anyBetween(TreeMap<Integer, String> marks, int low, int high) {
    boolean found = false;
    for (Map.Entry<Integer, String> mark : marks.entrySet()) {
      if (mark.getKey() > low && mark.getKey() < high) {
        found = true;
        break;
      }
    }
    return found;
  }

  int declines(TreeSet<Integer> marks, List<Integer> plain, int low, int high) {
    for (int mark : plain) {
      if (mark >= low && mark <= high) {
        return mark;
      }
    }
    for (int mark : marks) {
      System.out.println(mark);
      if (mark >= low && mark <= high) {
        return mark;
      }
    }
    for (int mark : marks) {
      if (mark >= low && mark != high) {
        return mark;
      }
    }
    return marks.ceiling(low);
  }
}
