import com.tngtech.archunit.core.domain.JavaClass;
import java.util.Arrays;
import java.util.List;

final class Spring {
  static final String ENTITY = "jakarta.persistence.Entity";
  static final String LEGACY_ENTITY = "javax.persistence.Entity";
  private static final String CONTROLLER = "org.springframework.stereotype.Controller";
  private static final String ADVICE = "org.springframework.web.bind.annotation.ControllerAdvice";
  private static final String SERVICE = "org.springframework.stereotype.Service";
  private static final String REPOSITORY = "org.springframework.stereotype.Repository";
  private static final String DATA_REPOSITORY = "org.springframework.data.repository.Repository";
  private static final List<String> WEB_PACKAGES =
      Arrays.asList(
          "jakarta.servlet.",
          "javax.servlet.",
          "org.springframework.web.bind.",
          "org.springframework.web.servlet.",
          "org.springframework.web.multipart.",
          "org.springframework.web.context.request.",
          "org.springframework.web.server.",
          "org.springframework.web.reactive.",
          "org.springframework.http.server.");
  private static final List<String> DATA_ACCESS =
      Arrays.asList(
          "org.springframework.jdbc.core.JdbcOperations",
          "org.springframework.jdbc.core.namedparam.NamedParameterJdbcOperations",
          "org.springframework.jdbc.core.simple.JdbcClient",
          "org.springframework.jdbc.core.simple.SimpleJdbcInsertOperations",
          "org.springframework.r2dbc.core.DatabaseClient",
          "org.springframework.data.jdbc.core.JdbcAggregateOperations",
          "org.springframework.data.r2dbc.core.R2dbcEntityOperations",
          "org.springframework.data.mongodb.core.MongoOperations",
          "org.springframework.data.mongodb.core.ReactiveMongoOperations",
          "jakarta.persistence.EntityManager",
          "javax.persistence.EntityManager",
          "jakarta.persistence.EntityManagerFactory",
          "javax.persistence.EntityManagerFactory",
          "org.hibernate.Session",
          "javax.sql.DataSource");
  private static final String RESPONSE_ENTITY = "org.springframework.http.ResponseEntity";
  private static final String KOTLIN_METADATA = "kotlin.Metadata";
  private static final int KOTLIN_FILE_FACADE = 2;

  private Spring() {}

  static JavaClass owner(JavaClass type) {
    JavaClass current = type;
    while (current.getEnclosingClass().isPresent()) {
      current = current.getEnclosingClass().get();
    }
    return current;
  }

  static boolean isController(JavaClass type) {
    return type.isMetaAnnotatedWith(CONTROLLER);
  }

  static boolean isService(JavaClass type) {
    return type.isMetaAnnotatedWith(SERVICE);
  }

  static boolean isRepository(JavaClass type) {
    return type.isMetaAnnotatedWith(REPOSITORY) || type.isAssignableTo(DATA_REPOSITORY);
  }

  static boolean isDataAccess(JavaClass type) {
    return isRepository(type) || DATA_ACCESS.stream().anyMatch(type::isAssignableTo);
  }

  static boolean isEntity(JavaClass type) {
    return type.isAnnotatedWith(ENTITY) || type.isAnnotatedWith(LEGACY_ENTITY);
  }

  static boolean isWebLayer(JavaClass type) {
    String name = type.getName();
    return isController(type) || type.isMetaAnnotatedWith(ADVICE) || WEB_PACKAGES.stream().anyMatch(name::startsWith);
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
