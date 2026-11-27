package nfs;

import static java.nio.file.FileSystems.newFileSystem;

import java.io.IOException;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Path;

class NewFs {
  FileSystem open(Path path, ClassLoader loader) throws IOException {
    FileSystems.newFileSystem(path, loader).close();
    FileSystems.newFileSystem(path, (ClassLoader) null).close();
    FileSystems.newFileSystem(path, (null)).close();
    newFileSystem(path, null).close();
    return FileSystems.newFileSystem(path, null);
  }

  @SuppressWarnings("NewFileSystem")
  FileSystem quiet(Path path) throws IOException {
    return FileSystems.newFileSystem(path, null);
  }
}
