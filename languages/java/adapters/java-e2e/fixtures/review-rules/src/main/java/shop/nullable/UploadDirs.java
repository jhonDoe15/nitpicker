package shop.nullable;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.UUID;
import org.springframework.util.Assert;

public final class UploadDirs {
  public void prepare(File localDir) {
    Assert.isTrue(localDir.mkdirs(), () -> "Cannot make " + localDir); // violation: MkdirsResultAsFailure
  }

  public void ensure(File dir) throws IOException {
    if (!dir.mkdirs()) { // violation: MkdirsResultAsFailure
      throw new IOException("cannot create " + dir);
    }
  }

  public boolean create(File dir) {
    if (dir.mkdirs() == false) { // violation: MkdirsResultAsFailure
      return false;
    }
    return true;
  }

  public void ensureSafely(File dir) throws IOException {
    if (!dir.mkdirs() && !dir.isDirectory()) {
      throw new IOException("cannot create " + dir);
    }
  }

  public void ensureWithNio(File dir) throws IOException {
    Files.createDirectories(dir.toPath());
  }

  public void ensureQuietly(File dir) {
    if (!dir.mkdirs()) {
      return;
    }
    dir.setReadable(true);
  }

  public void ensureUnbraced(File dir) throws IOException {
    if (!dir.mkdirs()) // violation: MkdirsResultAsFailure
      throw new IOException("cannot create " + dir);
  }

  public void ensureAfterCheck(File dir) throws IOException {
    if (!dir.exists()) {
      if (!dir.mkdirs()) {
        throw new IOException("cannot create " + dir);
      }
    }
  }

  public File ensureParent(File file) throws IOException {
    File parent = file.getParentFile();
    if (parent != null && !parent.isDirectory()) {
      if (!parent.mkdirs()) {
        throw new IOException("cannot create " + parent);
      }
    }
    return file;
  }

  public void ensureAfterDelete(File dir) throws IOException {
    if (dir.exists()) {
      Files.deleteIfExists(dir.toPath());
    }
    if (!dir.mkdir()) {
      throw new IOException("cannot create " + dir);
    }
  }

  public void ensureRechecked(File dir) throws IOException {
    if (!dir.mkdirs()) {
      if (!dir.isDirectory()) {
        throw new IOException("cannot create " + dir);
      }
    }
  }

  public File fresh(File base) throws IOException {
    File dir = new File(base, UUID.randomUUID().toString());
    if (!dir.mkdirs()) {
      throw new IOException("cannot create " + dir);
    }
    return dir;
  }

  public File freshTemp() throws IOException {
    File dir = Files.createTempFile("work", ".d").toFile();
    if (!dir.delete() || !dir.mkdir()) {
      throw new IOException("cannot create " + dir);
    }
    return dir;
  }
}
