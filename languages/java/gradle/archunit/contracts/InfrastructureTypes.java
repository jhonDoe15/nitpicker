import com.tngtech.archunit.core.domain.JavaClass;
import java.util.List;

final class InfrastructureTypes {
  static final String PERSISTENCE = "persistence";
  static final String TRANSPORT = "transport";
  private static final List<String> MORE_PERSISTENCE_TYPES =
      List.of(
          "jakarta.persistence.EntityTransaction",
          "javax.persistence.EntityTransaction",
          "jakarta.persistence.Query",
          "javax.persistence.Query",
          "org.hibernate.SharedSessionContract",
          "org.hibernate.SessionFactory",
          "java.sql.Connection",
          "java.sql.Statement",
          "java.sql.ResultSet",
          "io.r2dbc.spi.Connection",
          "io.r2dbc.spi.ConnectionFactory",
          "com.mongodb.client.MongoDatabase",
          "com.mongodb.client.MongoCollection",
          "com.mongodb.session.ClientSession",
          "com.mongodb.reactivestreams.client.MongoDatabase",
          "com.mongodb.reactivestreams.client.MongoCollection",
          "org.jooq.DSLContext");
  private static final String OUTBOUND_REQUEST = "org.springframework.http.RequestEntity";
  private static final List<String> REQUEST_TYPES =
      List.of(
          "jakarta.servlet.ServletRequest",
          "javax.servlet.ServletRequest",
          "org.springframework.web.server.ServerWebExchange",
          "org.springframework.web.reactive.function.server.ServerRequest",
          "jakarta.ws.rs.container.ContainerRequestContext",
          "javax.ws.rs.container.ContainerRequestContext",
          "io.micronaut.http.HttpRequest",
          "io.vertx.ext.web.RoutingContext");
  private static final List<String> TRANSPORT_TYPES =
      List.of(
          "jakarta.servlet.ServletResponse",
          "javax.servlet.ServletResponse",
          "jakarta.servlet.http.HttpSession",
          "javax.servlet.http.HttpSession",
          "jakarta.servlet.http.Part",
          "javax.servlet.http.Part",
          "org.springframework.http.server.ServerHttpRequest",
          "org.springframework.http.server.ServerHttpResponse",
          "org.springframework.http.server.reactive.ServerHttpRequest",
          "org.springframework.http.server.reactive.ServerHttpResponse",
          "org.springframework.web.context.request.WebRequest",
          "org.springframework.web.multipart.MultipartFile",
          "org.springframework.web.reactive.function.server.ServerResponse",
          "org.springframework.http.HttpEntity",
          "jakarta.ws.rs.core.Response",
          "javax.ws.rs.core.Response",
          "io.micronaut.http.HttpResponse");

  private InfrastructureTypes() {}

  static String kindOf(JavaClass type, Roles roles) {
    if (roles.isDataAccess(type) || MORE_PERSISTENCE_TYPES.stream().anyMatch(type::isAssignableTo)) {
      return PERSISTENCE;
    }
    boolean inbound = isRequest(type) || TRANSPORT_TYPES.stream().anyMatch(type::isAssignableTo);
    return inbound && !type.isAssignableTo(OUTBOUND_REQUEST) ? TRANSPORT : null;
  }

  static boolean isRequest(JavaClass type) {
    return REQUEST_TYPES.stream().anyMatch(type::isAssignableTo);
  }
}
