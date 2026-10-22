import com.tngtech.archunit.core.domain.JavaClass;
import java.util.List;

final class InfrastructureTypes {
  static final String PERSISTENCE = "persistence";
  static final String TRANSPORT = "transport";
  private static final List<String> PERSISTENCE_TYPES =
      List.of(
          "jakarta.persistence.EntityManager",
          "javax.persistence.EntityManager",
          "jakarta.persistence.EntityManagerFactory",
          "javax.persistence.EntityManagerFactory",
          "jakarta.persistence.EntityTransaction",
          "javax.persistence.EntityTransaction",
          "jakarta.persistence.Query",
          "javax.persistence.Query",
          "org.hibernate.SharedSessionContract",
          "org.hibernate.SessionFactory",
          "java.sql.Connection",
          "java.sql.Statement",
          "java.sql.ResultSet",
          "javax.sql.DataSource",
          "org.springframework.jdbc.core.JdbcOperations",
          "org.springframework.jdbc.core.namedparam.NamedParameterJdbcOperations",
          "org.springframework.jdbc.core.simple.JdbcClient",
          "org.springframework.jdbc.core.simple.SimpleJdbcInsertOperations",
          "org.springframework.r2dbc.core.DatabaseClient",
          "org.springframework.data.jdbc.core.JdbcAggregateOperations",
          "org.springframework.data.r2dbc.core.R2dbcEntityOperations",
          "org.springframework.data.mongodb.core.MongoOperations",
          "org.springframework.data.mongodb.core.ReactiveMongoOperations",
          "io.r2dbc.spi.Connection",
          "io.r2dbc.spi.ConnectionFactory",
          "com.mongodb.client.MongoDatabase",
          "com.mongodb.client.MongoCollection",
          "com.mongodb.session.ClientSession",
          "com.mongodb.reactivestreams.client.MongoDatabase",
          "com.mongodb.reactivestreams.client.MongoCollection",
          "org.jooq.DSLContext");
  private static final List<String> TRANSPORT_TYPES =
      List.of(
          "jakarta.servlet.ServletRequest",
          "javax.servlet.ServletRequest",
          "jakarta.servlet.ServletResponse",
          "javax.servlet.ServletResponse",
          "jakarta.servlet.http.HttpSession",
          "javax.servlet.http.HttpSession",
          "jakarta.servlet.http.Part",
          "javax.servlet.http.Part",
          "org.springframework.web.server.ServerWebExchange",
          "org.springframework.http.server.ServerHttpRequest",
          "org.springframework.http.server.ServerHttpResponse",
          "org.springframework.http.server.reactive.ServerHttpRequest",
          "org.springframework.http.server.reactive.ServerHttpResponse",
          "org.springframework.web.context.request.WebRequest",
          "org.springframework.web.multipart.MultipartFile",
          "org.springframework.web.reactive.function.server.ServerRequest",
          "org.springframework.web.reactive.function.server.ServerResponse",
          "org.springframework.http.HttpEntity",
          "jakarta.ws.rs.core.Response",
          "javax.ws.rs.core.Response",
          "jakarta.ws.rs.container.ContainerRequestContext",
          "javax.ws.rs.container.ContainerRequestContext",
          "io.micronaut.http.HttpRequest",
          "io.micronaut.http.HttpResponse",
          "io.vertx.ext.web.RoutingContext");

  private InfrastructureTypes() {}

  static String kindOf(JavaClass type, boolean repository) {
    if (repository || PERSISTENCE_TYPES.stream().anyMatch(type::isAssignableTo)) {
      return PERSISTENCE;
    }
    return TRANSPORT_TYPES.stream().anyMatch(type::isAssignableTo) ? TRANSPORT : null;
  }
}
