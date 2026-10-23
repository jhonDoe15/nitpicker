package nitpicker.designfacts.facts;

import java.util.*;
import nitpicker.designfacts.model.*;

public final class TypeFacts {
  private final Mutability mutability;

  public TypeFacts(Mutability mutability) {
    this.mutability = mutability;
  }

  public Map<String, Object> build(TypeInfo type) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("id", type.id);
    map.put("file", type.unit.file);
    map.put("name", type.simple);
    map.put("line", type.unit.line(type.tree));
    map.put("kind", type.designKind);
    map.put("exported", type.exported());
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
    map.put("fields", fields);
    map.put("cases", type.isEnum() ? type.cases : null);
    return map;
  }
}
