import com.tngtech.archunit.core.domain.JavaClass;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class Roles {
  static final String PROPERTY = "nitpicker.spring.roles";
  private static final String CONTROLLER_ROLE = "controller";
  private static final String SERVICE_ROLE = "service";
  private static final String REPOSITORY_ROLE = "repository";
  private static final String CONTROLLER = "org.springframework.stereotype.Controller";
  private static final String ADVICE = "org.springframework.web.bind.annotation.ControllerAdvice";
  private static final String SERVICE = "org.springframework.stereotype.Service";
  private static final String REPOSITORY = "org.springframework.stereotype.Repository";
  private static final String DATA_REPOSITORY = "org.springframework.data.repository.Repository";
  private static final String REPOSITORY_DEFINITION = "org.springframework.data.repository.RepositoryDefinition";
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
  static final List<String> DATA_ACCESS =
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

  private final Map<String, List<String>> mapped;

  private Roles(Map<String, List<String>> mapped) {
    this.mapped = mapped;
  }

  static Roles load() throws IOException {
    Map<String, List<String>> mapped = new HashMap<>();
    String file = System.getProperty(PROPERTY, "");
    if (!file.isEmpty()) {
      for (String line : Files.readAllLines(Paths.get(file), StandardCharsets.UTF_8)) {
        int split = line.indexOf('=');
        if (split > 0) {
          mapped.computeIfAbsent(line.substring(0, split), role -> new ArrayList<>()).add(line.substring(split + 1));
        }
      }
    }
    return new Roles(mapped);
  }

  boolean isController(JavaClass type) {
    return type.isMetaAnnotatedWith(CONTROLLER) || hasMappedRole(CONTROLLER_ROLE, type);
  }

  boolean isService(JavaClass type) {
    return type.isMetaAnnotatedWith(SERVICE) || hasMappedRole(SERVICE_ROLE, type);
  }

  boolean isRepository(JavaClass type) {
    return type.isMetaAnnotatedWith(REPOSITORY)
        || type.isMetaAnnotatedWith(REPOSITORY_DEFINITION)
        || type.isAssignableTo(DATA_REPOSITORY)
        || hasMappedRole(REPOSITORY_ROLE, type);
  }

  boolean isDataAccess(JavaClass type) {
    return isRepository(type) || DATA_ACCESS.stream().anyMatch(type::isAssignableTo);
  }

  boolean isWebLayer(JavaClass type) {
    String name = type.getName();
    return isController(type) || type.isMetaAnnotatedWith(ADVICE) || WEB_PACKAGES.stream().anyMatch(name::startsWith);
  }

  private boolean hasMappedRole(String role, JavaClass type) {
    return mapped.getOrDefault(role, List.of()).stream()
        .anyMatch(
            name -> type.isMetaAnnotatedWith(name) || (!type.getName().equals(name) && type.isAssignableTo(name)));
  }
}
