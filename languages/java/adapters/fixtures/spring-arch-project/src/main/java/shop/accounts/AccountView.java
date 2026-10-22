package shop.accounts;

import org.springframework.validation.annotation.Validated;

@Validated
public record AccountView(long id, String name) {}
