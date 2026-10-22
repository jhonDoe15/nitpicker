package nitpicker.effects.classes;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

public final class ClassPath implements AutoCloseable {
  private final List<Path> directories = new ArrayList<>();
  private final List<Path> archives = new ArrayList<>();
  private final List<ZipFile> opened = new ArrayList<>();
  private Map<String, ZipFile> entries;

  public ClassPath(List<String> paths) {
    for (String entry : paths) {
      Path path = Path.of(entry);
      if (Files.isDirectory(path)) {
        directories.add(path);
      } else if (Files.isRegularFile(path) && entry.endsWith(".jar")) {
        archives.add(path);
      }
    }
  }

  public byte[] read(String internalName) {
    String resource = internalName + ".class";
    try {
      for (Path directory : directories) {
        Path file = directory.resolve(resource);
        if (Files.isRegularFile(file)) {
          return Files.readAllBytes(file);
        }
      }
      ZipFile archive = archiveEntries().get(resource);
      if (archive != null) {
        try (InputStream in = archive.getInputStream(archive.getEntry(resource))) {
          return in.readAllBytes();
        }
      }
      try (InputStream in = ClassLoader.getSystemResourceAsStream(resource)) {
        return in == null ? null : in.readAllBytes();
      }
    } catch (IOException unreadable) {
      return null;
    }
  }

  private Map<String, ZipFile> archiveEntries() throws IOException {
    if (entries != null) {
      return entries;
    }
    entries = new HashMap<>();
    for (Path archive : archives) {
      ZipFile zip;
      try {
        zip = new ZipFile(archive.toFile());
      } catch (IOException broken) {
        continue;
      }
      opened.add(zip);
      Enumeration<? extends ZipEntry> all = zip.entries();
      while (all.hasMoreElements()) {
        String name = all.nextElement().getName();
        if (name.endsWith(".class") && !name.startsWith("META-INF/")) {
          entries.putIfAbsent(name, zip);
        }
      }
    }
    return entries;
  }

  @Override
  public void close() throws IOException {
    for (ZipFile zip : opened) {
      zip.close();
    }
  }
}
