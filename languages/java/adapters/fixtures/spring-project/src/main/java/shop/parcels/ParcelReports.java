package shop.parcels;

import jakarta.persistence.EntityManager;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ParcelReports {
  private static final String CLEAR_LOG = "delete from parcel_log";

  private final ParcelRepository parcels;
  private final JdbcTemplate jdbc;
  private final NamedParameterJdbcTemplate named;
  private final JdbcClient client;
  private final DSLContext dsl;
  private final EntityManager entityManager;

  public ParcelReports(
      ParcelRepository parcels,
      JdbcTemplate jdbc,
      NamedParameterJdbcTemplate named,
      JdbcClient client,
      DSLContext dsl,
      EntityManager entityManager) {
    this.parcels = parcels;
    this.jdbc = jdbc;
    this.named = named;
    this.client = client;
    this.dsl = dsl;
    this.entityManager = entityManager;
  }

  public int lose(Long id) {
    return parcels.lose(id); // violation: SpringTransactionalReadOnlyWrite
  }

  public void loseAll() {
    parcels.loseAll("SENT"); // violation: SpringTransactionalReadOnlyWrite
  }

  public void archiveWithJdbc(Long id) {
    jdbc.update("update parcel set status = 'ARCHIVED' where id = ?", id); // violation: SpringTransactionalReadOnlyWrite
  }

  public void clearWithJdbc() {
    jdbc.execute(CLEAR_LOG); // violation: SpringTransactionalReadOnlyWrite
  }

  public void truncateWithJdbc() {
    jdbc.execute("TRUNCATE TABLE parcel_log"); // violation: SpringTransactionalReadOnlyWrite
  }

  public void archiveWithNamed() {
    named.execute("delete from parcel where status = 'LOST'", statement -> statement.execute()); // violation: SpringTransactionalReadOnlyWrite
  }

  public int archiveWithClient(Long id) {
    return client.sql("delete from parcel where id = :id").param("id", id).update(); // violation: SpringTransactionalReadOnlyWrite
  }

  public int archiveWithJooq(Long id) {
    return dsl.deleteFrom(DSL.table("parcel")).where(DSL.field("id").eq(id)).execute(); // violation: SpringTransactionalReadOnlyWrite
  }

  public int logWithJooq(Long id) {
    return dsl.insertInto(DSL.table("parcel_log")).values(id).execute(); // violation: SpringTransactionalReadOnlyWrite
  }

  public int relabelWithJooq(Long id) {
    return dsl.update(DSL.table("parcel")) // violation: SpringTransactionalReadOnlyWrite
        .set(DSL.field("status"), "SEEN")
        .where(DSL.field("id").eq(id))
        .execute();
  }

  public int archiveWithQuery() {
    return entityManager.createQuery("delete from Parcel p").executeUpdate(); // violation: SpringTransactionalReadOnlyWrite
  }

  public Parcel markSeen(Long id) {
    Parcel parcel = parcels.findById(id).orElseThrow();
    parcel.setStatus("SEEN"); // violation: SpringTransactionalReadOnlyWrite
    return parcel;
  }

  public Parcel markFound(Long id) {
    var parcel = entityManager.find(Parcel.class, id);
    parcel.status = "FOUND"; // violation: SpringTransactionalReadOnlyWrite
    return parcel;
  }

  public Parcel markReferenced(Long id) {
    Parcel parcel = parcels.getReferenceById(id);
    parcel.setStatus("SEEN"); // violation: SpringTransactionalReadOnlyWrite
    return parcel;
  }
}
