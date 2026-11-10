import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class ContractMethods {
  private static final String RECORD = "java.lang.Record";
  private static final Pattern ACCESSOR = Pattern.compile("(get|is|set)([A-Z].*)");
  private static final Pattern COMPONENT = Pattern.compile("component\\d+");

  private final JavaClass type;
  private final Set<String> kotlinNames;

  private ContractMethods(JavaClass type) {
    this.type = type;
    this.kotlinNames = kotlinNames(type);
  }

  static List<JavaMethod> of(JavaClass type, JavaClasses main) {
    ContractMethods filter = new ContractMethods(type);
    List<JavaMethod> methods = new ArrayList<>();
    for (JavaMethod method : Contracts.publicMethods(type)) {
      if (!filter.isGenerated(method) && !overridesLibraryMethod(method, main)) {
        methods.add(method);
      }
    }
    return methods;
  }

  private boolean isGenerated(JavaMethod method) {
    return isRecordAccessor(method) || isDataClassMember(method) || isPropertyAccessor(method);
  }

  private boolean isRecordAccessor(JavaMethod method) {
    boolean record = type.getRawSuperclass().map(superclass -> superclass.getName().equals(RECORD)).orElse(false);
    return record && method.getRawParameterTypes().isEmpty() && hasField(method.getName());
  }

  private boolean isDataClassMember(JavaMethod method) {
    String name = method.getName();
    boolean member = name.equals("copy") || COMPONENT.matcher(name).matches();
    return member && kotlinNames != null && isDataClass();
  }

  private boolean isDataClass() {
    Set<String> names = new LinkedHashSet<>();
    type.getMethods().forEach(method -> names.add(method.getName()));
    return names.containsAll(List.of("component1", "copy", "copy$default"));
  }

  private boolean isPropertyAccessor(JavaMethod method) {
    Matcher matcher = ACCESSOR.matcher(method.getName());
    if (kotlinNames == null || !matcher.matches()) {
      return false;
    }
    int arity = matcher.group(1).equals("set") ? 1 : 0;
    if (method.getRawParameterTypes().size() != arity) {
      return false;
    }
    String rest = matcher.group(2);
    String property = Character.toLowerCase(rest.charAt(0)) + rest.substring(1);
    return kotlinNames.contains(property) || kotlinNames.contains("is" + rest) || hasField(property);
  }

  private boolean hasField(String name) {
    return type.getFields().stream().map(JavaField::getName).anyMatch(name::equals);
  }

  private static Set<String> kotlinNames(JavaClass type) {
    return type.tryGetAnnotationOfType(Spring.KOTLIN_METADATA)
        .flatMap(metadata -> metadata.get("d2"))
        .filter(String[].class::isInstance)
        .map(strings -> (Set<String>) new LinkedHashSet<>(Arrays.asList((String[]) strings)))
        .orElse(null);
  }

  private static boolean overridesLibraryMethod(JavaMethod method, JavaClasses main) {
    Set<JavaClass> supertypes = new LinkedHashSet<>(method.getOwner().getAllRawSuperclasses());
    supertypes.addAll(method.getOwner().getAllRawInterfaces());
    int arity = method.getRawParameterTypes().size();
    return supertypes.stream()
        .filter(supertype -> !main.contain(supertype.getName()))
        .flatMap(supertype -> supertype.getMethods().stream())
        .anyMatch(
            declared -> declared.getName().equals(method.getName()) && declared.getRawParameterTypes().size() == arity);
  }
}
