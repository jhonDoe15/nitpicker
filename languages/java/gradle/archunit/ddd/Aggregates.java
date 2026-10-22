import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import java.util.Map;
import java.util.Set;

final class Aggregates {
  static final String AGGREGATE_REFERENCE = "ddd-aggregate-reference";
  static final String FOREIGN_ENTITY = "ddd-foreign-entity";
  static final String VALUE_REFERENCE = "ddd-value-object-reference";

  private Aggregates() {}

  static void check(JavaClasses main, Set<Found> sink) {
    DddModel model = new DddModel(main);
    for (Map.Entry<JavaClass, Set<JavaClass>> member : model.members().entrySet()) {
      checkMember(model, member.getKey(), member.getValue(), sink);
    }
    for (JavaClass value : model.values()) {
      model.heldTypes(value).stream()
          .filter(model::isIdentifiable)
          .forEach(target -> Found.add(sink, VALUE_REFERENCE, value, target.getName()));
    }
  }

  private static void checkMember(DddModel model, JavaClass member, Set<JavaClass> aggregates, Set<Found> sink) {
    for (JavaClass held : model.heldTypes(member)) {
      if (held.equals(member)) {
        continue;
      }
      if (model.isRoot(held)) {
        if (!DddModel.sameAggregate(aggregates, held)) {
          Found.add(sink, AGGREGATE_REFERENCE, member, held.getName());
        }
        continue;
      }
      for (JavaClass owner : model.ownersOf(held)) {
        if (!DddModel.sameAggregate(aggregates, owner)) {
          Found.add(sink, FOREIGN_ENTITY, member, owner.getName() + ":" + held.getName());
        }
      }
    }
  }
}
