package nitpicker.designfacts.facts;

import java.util.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;

public final class TypeFacts {
  private final Mutability mutability;
  private final Project project;

  public TypeFacts(Mutability mutability, Project project) {
    this.mutability = mutability;
    this.project = project;
  }

  public Map<String, Object> build(TypeInfo type) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("id", type.id);
    map.put("file", type.unit.file);
    map.put("name", type.simple);
    map.put("line", type.unit.line(type.tree));
    map.put("kind", type.designKind);
    map.put("exported", type.exported());
    map.put("fields", fields(type));
    map.put("supertypes", supertypes(type));
    map.put("cases", type.isEnum() ? type.cases : null);
    return map;
  }

  private List<Map<String, Object>> fields(TypeInfo type) {
    List<Map<String, Object>> fields = new ArrayList<>();
    for (FieldInfo field : type.fields) {
      if (!field.isStatic) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("name", field.name);
        entry.put("mutable", mutability.isMutable(type, field) ? Boolean.TRUE : null);
        entry.put("private", field.isPrivate() ? Boolean.TRUE : null);
        fields.add(entry);
      }
    }
    return fields;
  }

  private List<String> supertypes(TypeInfo type) {
    project.link(type);
    Set<String> ids = new LinkedHashSet<>();
    for (TypeInfo parent : type.supers) {
      if (parent.designKind != null) {
        ids.add(parent.id);
      }
    }
    return ids.isEmpty() ? null : List.copyOf(ids);
  }
}
