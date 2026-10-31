package nitpicker.kotlinpsi.design.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jetbrains.kotlin.psi.KtClassOrObject;

public final class Owner {
  public final String id;
  public final String name;
  public final String qname;
  public final Source source;
  public final KtClassOrObject psi;
  public final Owner outer;
  public final Map<String, Owner> nested = new LinkedHashMap<>();
  public final List<Fun> funs = new ArrayList<>();
  public final List<Fun> constructors = new ArrayList<>();
  public final Map<String, Prop> props = new LinkedHashMap<>();
  public Owner companion;
  public List<String> cases = List.of();
  public Owner caseOf;
  public boolean listed = true;
  public boolean exported = true;

  public record Place(Source source, Owner outer) {}

  public Owner(Place place, String name, KtClassOrObject psi) {
    this.source = place.source();
    this.outer = place.outer();
    this.name = name;
    this.psi = psi;
    this.qname = outer == null ? name : outer.qname + "." + name;
    this.id = psi == null ? source.path : source.path + "#" + qname;
  }

  public boolean module() {
    return psi == null;
  }

  public String fqn() {
    return source.pkg.isEmpty() ? qname : source.pkg + "." + qname;
  }
}
