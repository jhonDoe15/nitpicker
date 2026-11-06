package shop.wiring;

import java.util.Iterator;
import java.util.List;
import java.util.function.Consumer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

@Component
public class Customizers {
  private final ObjectProvider<Consumer<StringBuilder>> customizers;

  public Customizers(ObjectProvider<Consumer<StringBuilder>> customizers) {
    this.customizers = customizers;
  }

  public String unordered() {
    StringBuilder text = new StringBuilder();
    customizers.forEach(customizer -> customizer.accept(text)); // violation: SpringOrderedProvider
    customizers.stream().forEach(customizer -> customizer.accept(text)); // violation: SpringOrderedProvider
    for (Consumer<StringBuilder> customizer : customizers) { // violation: SpringOrderedProvider
      customizer.accept(text);
    }
    Iterator<Consumer<StringBuilder>> each = customizers.iterator(); // violation: SpringOrderedProvider
    each.next().accept(text);
    return text.toString();
  }

  public String ordered(List<Consumer<StringBuilder>> extra) {
    StringBuilder text = new StringBuilder();
    customizers.orderedStream().forEach(customizer -> customizer.accept(text));
    customizers.ifAvailable(customizer -> customizer.accept(text));
    extra.forEach(customizer -> customizer.accept(text));
    return text.toString();
  }
}
