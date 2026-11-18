package nitpicker.host;

import java.io.IOException;
import java.io.InputStream;
import java.net.JarURLConnection;
import java.net.URL;
import java.net.URLClassLoader;
import java.security.CodeSource;
import java.security.cert.Certificate;
import java.util.jar.Manifest;

final class HostLoader extends URLClassLoader {
  private static final String EXIT = "nitpicker.host.Exit";
  private static final ClassLoader JDK_ONLY = new JdkOnly();

  static {
    registerAsParallelCapable();
  }

  HostLoader(URL[] urls) {
    super("tool", urls, JDK_ONLY);
  }

  @Override
  protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
    if (name.equals(EXIT)) {
      return HostLoader.class.getClassLoader().loadClass(name);
    }
    return super.loadClass(name, resolve);
  }

  @Override
  protected Class<?> findClass(String name) throws ClassNotFoundException {
    String path = name.replace('.', '/') + ".class";
    URL resource = findResource(path);
    if (resource == null) {
      throw new ClassNotFoundException(name);
    }
    try {
      Source source = Source.of(resource, path);
      byte[] bytes = ExitRewriter.rewrite(source.bytes);
      definePackageOf(name, source);
      return defineClass(name, bytes, 0, bytes.length, source.codeSource);
    } catch (IOException failure) {
      throw new ClassNotFoundException(name, failure);
    }
  }

  private void definePackageOf(String className, Source source) {
    int dot = className.lastIndexOf('.');
    if (dot < 0 || getDefinedPackage(className.substring(0, dot)) != null) {
      return;
    }
    try {
      String name = className.substring(0, dot);
      if (source.manifest == null) {
        definePackage(name, null, null, null, null, null, null, null);
      } else {
        definePackage(name, source.manifest, source.location);
      }
    } catch (IllegalArgumentException alreadyDefined) {
      return;
    }
  }

  private static final class Source {
    final byte[] bytes;
    final Manifest manifest;
    final URL location;
    final CodeSource codeSource;

    private Source(byte[] bytes, Manifest manifest, URL location) {
      this.bytes = bytes;
      this.manifest = manifest;
      this.location = location;
      this.codeSource = new CodeSource(location, (Certificate[]) null);
    }

    static Source of(URL resource, String path) throws IOException {
      if (resource.getProtocol().equals("jar")) {
        JarURLConnection connection = (JarURLConnection) resource.openConnection();
        try (InputStream in = connection.getInputStream()) {
          return new Source(in.readAllBytes(), connection.getManifest(), connection.getJarFileURL());
        }
      }
      String text = resource.toString();
      URL root = new URL(text.substring(0, text.length() - path.length()));
      try (InputStream in = resource.openStream()) {
        return new Source(in.readAllBytes(), null, root);
      }
    }
  }

  private static final class JdkOnly extends ClassLoader {
    JdkOnly() {
      super(ClassLoader.getPlatformClassLoader());
    }

    @Override
    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
      try {
        return getParent().loadClass(name);
      } catch (ClassNotFoundException notPlatform) {
        Class<?> found = ClassLoader.getSystemClassLoader().loadClass(name);
        Module module = found.getModule();
        if (module.isNamed() && module.getLayer() == ModuleLayer.boot()) {
          return found;
        }
        throw new ClassNotFoundException(name);
      }
    }
  }
}
