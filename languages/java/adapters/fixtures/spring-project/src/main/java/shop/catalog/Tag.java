package shop.catalog;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity // violation: JpaEntityClass
public record Tag(@Id Long id, String name) {}
