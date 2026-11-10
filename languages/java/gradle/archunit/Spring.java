import com.tngtech.archunit.core.domain.JavaClass;

final class Spring {
  static final String ENTITY = "jakarta.persistence.Entity";
  static final String LEGACY_ENTITY = "javax.persistence.Entity";
  private static final String RESPONSE_ENTITY = "org.springframework.http.ResponseEntity";
  static final String CONFIGURATION = "org.springframework.context.annotation.Configuration";
  static final String KOTLIN_METADATA = "kotlin.Metadata";
  private static final int KOTLIN_FILE_FACADE = 2;

  private Spring() {}

  static JavaClass owner(JavaClass type) {
    JavaClass current = type;
    while (current.getEnclosingClass().isPresent()) {
      current = current.getEnclosingClass().get();
    }
    return current;
  }

  static boolean isEntity(JavaClass type) {
    return type.isAnnotatedWith(ENTITY) || type.isAnnotatedWith(LEGACY_ENTITY);
  }

  static boolean isResponseEntity(JavaClass type) {
    return type.getName().equals(RESPONSE_ENTITY);
  }

  static boolean isFileFacade(JavaClass type) {
    return type.tryGetAnnotationOfType(KOTLIN_METADATA)
        .flatMap(metadata -> metadata.get("k"))
        .map(kind -> Integer.valueOf(KOTLIN_FILE_FACADE).equals(kind))
        .orElse(false);
  }

  static String sourceFile(JavaClass type) {
    return type.getSource().flatMap(source -> source.getFileName()).orElse("");
  }

  static boolean isGenerated(JavaClass type) {
    String simple = type.getSimpleName();
    return simple.equals("package-info") || simple.equals("module-info");
  }
}
