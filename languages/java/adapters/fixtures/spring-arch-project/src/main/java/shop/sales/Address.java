package shop.sales;

import org.jmolecules.ddd.types.ValueObject;

public record Address(String street, Customer resident) implements ValueObject {}
