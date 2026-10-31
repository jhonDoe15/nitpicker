package sale;

import java.util.List;

public class Till {
  public void ring(Basket basket, Receipt receipt, Label label) {
    List<String> lines = basket.getLines();
    lines.add("x");
    receipt.getEntries().add("y");
    boolean open = basket.isOpen();
    Boolean sealed = basket.getSealed();
    receipt.getNumber();
    label.getText();
  }
}
