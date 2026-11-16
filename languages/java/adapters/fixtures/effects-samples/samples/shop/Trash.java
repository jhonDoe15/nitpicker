package shop;

import java.time.Instant;
import java.util.List;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import org.hibernate.annotations.SQLRestriction;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Service;

@Entity
class Parcel {
  @Id Long id;
  String owner;
  Instant deletedAt;
}

@Entity
@SQLRestriction("deleted_at is null")
class Shipment {
  @Id Long id;
  String owner;
  Instant deletedAt;
}

interface ParcelStore extends CrudRepository<Parcel, Long> {
  List<Parcel> findByOwnerAndDeletedAtIsNull(String owner);

  List<Parcel> findByIdInAndDeletedAtIsNull(List<Long> ids);

  long countByOwnerAndDeletedAtIsNull(String owner);

  boolean existsByIdAndDeletedAtIsNull(Long id);

  @Query("select p from Parcel p where p.id = :id and p.deletedAt is null")
  List<Parcel> visible(Long id);

  List<Parcel> findByOwner(String owner);
}

interface Shipments extends CrudRepository<Shipment, Long> {
  List<Shipment> findByOwner(String owner);

  List<Shipment> findByIdIn(List<Long> ids);

  long countByOwner(String owner);

  boolean existsById(Long id);

  List<Shipment> findAllByOwner(String owner);

  List<Shipment> findByIdNot(Long id);
}

@Service
class Trash {
  private final ParcelStore parcels;
  private final Shipments shipments;

  Trash(ParcelStore parcels, Shipments shipments) {
    this.parcels = parcels;
    this.shipments = shipments;
  }

  List<Parcel> live(String owner) {
    return parcels.findByOwnerAndDeletedAtIsNull(owner);
  }

  List<Parcel> leaked(String owner) {
    return parcels.findByOwner(owner);
  }

  List<Shipment> restricted(String owner) {
    return shipments.findByOwner(owner);
  }
}
