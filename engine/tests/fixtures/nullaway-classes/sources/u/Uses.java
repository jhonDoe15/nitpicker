package u;

import java.util.List;
import java.util.Map;
import lib.Registrar;
import lib.Util;

public class Uses {
  int reads() {
    int sum = Util.maybe.length() + Util.sure.length();
    sum += Util.elements.length + Util.array.length + Util.list.size();
    sum += Util.loader().hashCode() + Util.entry().hashCode() + Util.inner(new Util.Outer()).hashCode();
    sum += Util.checker().length() + Util.elementResult().length + Util.arrayResult().length;
    sum += Util.same("a").length() + Util.same(Util.maybe).length() + Util.same(Util.sure).length();
    sum += Util.chosen(null, true).length() + Util.chosen("b", false).length();
    return sum + Util.bounded("").length();
  }

  void passes() {
    Util.hasText(null);
    Util.notNull(null, (String) null);
    Util.spread(null, null);
    Util.spread((String[]) null);
    Util.spreadArray((String[]) null);
    Util.elements(null);
    Util.array(null);
    Util.listed(null);
  }

  static class Implemented implements Registrar {
    @Override
    public void register(String name, ClassLoader loader) {}

    @Override
    public void lists(List<? extends Number> numbers, Map<String, Object> map, String key) {}

    @Override
    public void arrays(String[] values, String[] elements, int key) {}

    @Override
    public void spread(String key, Object... rest) {}

    @Override
    public void spreadArray(String key, Object... rest) {}

    @Override
    public void nested(Map.Entry<String, String> entry, String key) {}

    @Override
    public void inner(Util.Outer.Inner inner, String key) {}

    @Override
    public void checker(String text, String key) {}

    @Override
    public String result() {
      return "";
    }

    @Override
    public String[] arrayResult() {
      return null;
    }

    @Override
    public String[] elementResult() {
      return null;
    }
  }
}
