package shop.parcels;

import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class ParcelImports {
  private final ParcelRepository parcels;
  private final JdbcTemplate jdbc;
  private final DSLContext dsl;

  public ParcelImports(ParcelRepository parcels, JdbcTemplate jdbc, DSLContext dsl) {
    this.parcels = parcels;
    this.jdbc = jdbc;
    this.dsl = dsl;
  }

  public void replaceLog(Long id) { // violation: SpringMultiWriteWithoutTransaction
    jdbc.execute("delete from parcel_log");
    dsl.insertInto(DSL.table("parcel_log")).values(id).execute();
  }

  public int countTwice() {
    return parcels.countInStatus("SENT") + parcels.countInStatus("LOST");
  }
}
