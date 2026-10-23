import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.MethodNode;

final class RequestState {
  static final String REQUEST_STATE = "spring-request-state";
  private static final List<String> HANDLERS =
      List.of(
          "org.springframework.web.bind.annotation.RequestMapping",
          "org.springframework.messaging.handler.annotation.MessageMapping",
          "org.springframework.graphql.data.method.annotation.SchemaMapping",
          "org.springframework.graphql.data.method.annotation.BatchMapping",
          "org.springframework.kafka.annotation.KafkaListener",
          "org.springframework.amqp.rabbit.annotation.RabbitListener",
          "org.springframework.jms.annotation.JmsListener");
  private static final List<String> SET_UP =
      List.of(
          "jakarta.annotation.PostConstruct",
          "javax.annotation.PostConstruct",
          "org.springframework.context.annotation.Bean");

  private RequestState() {}

  static void check(JavaClasses main, Set<Found> sink) {
    Set<JavaClass> shared = Lifetimes.singletons(main);
    Set<String> singletons = shared.stream().map(JavaClass::getName).collect(Collectors.toSet());
    Flows analyzed = new Flows(main);
    Map<String, JavaClass> classes = analyzed.classes();
    Library library = analyzed.library();
    Map<String, MethodFlow> flows = new LinkedHashMap<>();
    Map<String, JavaMethod> declared = new LinkedHashMap<>();
    analyzed.declared().forEach((key, found) -> analyzed.of(key).ifPresent(flow -> {
      Optional<JavaMethod> javaMethod = javaMethod(found.type, found.method);
      flow.holdsState = singletons.contains(found.type.getName());
      flow.setsUp = flow.name.startsWith("<") || flow.name.equals("afterPropertiesSet")
          || javaMethod.map(method -> SET_UP.stream().anyMatch(method::isMetaAnnotatedWith)).orElse(false);
      flows.put(key, flow);
      javaMethod.ifPresent(method -> declared.put(key, method));
    }));
    Summaries summaries = new Summaries(flows, classes);
    Map<Reach.Sink, String> reported = new TreeMap<>();
    for (MethodFlow flow : flows.values()) {
      for (Map.Entry<String, String> source : sources(flow, declared.get(flow.key()), library).entrySet()) {
        for (Reach.Sink found : summaries.reach(flow, Set.of(source.getKey())).sinks) {
          reported.merge(new Reach.Sink(found.owner, found.field, ""), found.op + ":" + source.getValue(),
              (first, second) -> first.compareTo(second) <= 0 ? first : second);
        }
      }
    }
    Set<JavaClass> perUse = Lifetimes.perUseBeans(main);
    reported.forEach((found, use) -> {
      JavaClass owner = classes.get(found.owner);
      if (!holdsPerUseBean(owner, found.field, perUse, shared)) {
        Found.add(sink, REQUEST_STATE, owner, found.field + ":" + use);
      }
    });
  }

  private static boolean holdsPerUseBean(JavaClass owner, String field, Set<JavaClass> perUse, Set<JavaClass> shared) {
    Optional<String> type = owner.tryGetField(field).map(declared -> declared.getRawType().getName());
    return type.isPresent()
        && perUse.stream().anyMatch(bean -> bean.isAssignableTo(type.get()))
        && shared.stream().noneMatch(bean -> bean.isAssignableTo(type.get()));
  }

  private static Map<String, String> sources(MethodFlow flow, JavaMethod method, Library library) {
    Map<String, String> sources = new TreeMap<>();
    boolean handler = method != null && HANDLERS.stream().anyMatch(method::isMetaAnnotatedWith);
    Type[] types = Type.getArgumentTypes(flow.desc);
    int first = flow.instance ? 1 : 0;
    for (int index = 0; index < types.length; index++) {
      boolean request = types[index].getSort() == Type.OBJECT && library.isRequest(types[index].getClassName());
      if (handler || request) {
        String simple = flow.owner.substring(flow.owner.lastIndexOf('/') + 1).replaceAll(".*\\$", "");
        sources.put(Flow.ARG + (index + first),
            simple + "." + flow.name + "(" + flow.argumentNames.get(index + first) + ")");
      }
    }
    flow.sources.forEach(source -> sources.put(source, source.substring(Flow.SOURCE.length())));
    return sources;
  }

  private static Optional<JavaMethod> javaMethod(JavaClass type, MethodNode method) {
    List<String> parameters =
        Arrays.stream(Type.getArgumentTypes(method.desc)).map(RequestState::typeName).collect(Collectors.toList());
    return type.getMethods().stream()
        .filter(candidate -> candidate.getName().equals(method.name))
        .filter(candidate -> candidate.getRawParameterTypes().stream().map(JavaClass::getName)
            .collect(Collectors.toList()).equals(parameters))
        .findFirst();
  }

  private static String typeName(Type type) {
    return type.getSort() == Type.ARRAY ? type.getDescriptor().replace('/', '.') : type.getClassName();
  }
}
