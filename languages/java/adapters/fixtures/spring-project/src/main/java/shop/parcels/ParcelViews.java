package shop.parcels;

import java.util.List;
import java.util.Map;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ParcelViews {
  private final ParcelRepository parcels;
  private final JdbcTemplate jdbc;
  private final DSLContext dsl;

  public ParcelViews(ParcelRepository parcels, JdbcTemplate jdbc, DSLContext dsl) {
    this.parcels = parcels;
    this.jdbc = jdbc;
    this.dsl = dsl;
  }

  public int countSent() {
    return parcels.countInStatus("SENT");
  }

  public List<Parcel> sent() {
    return parcels.inStatus("SENT");
  }

  public void warm() {
    jdbc.execute("select 1");
  }

  public List<Map<String, Object>> rows() {
    return jdbc.queryForList("select * from parcel");
  }

  public int count() {
    return dsl.fetchCount(DSL.table("parcel"));
  }

  public ParcelView view(Long id) {
    Parcel parcel = parcels.findById(id).orElseThrow();
    ParcelView view = new ParcelView();
    view.setStatus(parcel.getStatus());
    return view;
  }

  @Transactional
  public void markSeen(Long id) {
    Parcel parcel = parcels.findById(id).orElseThrow();
    parcel.setStatus("SEEN");
  }

  public static final class ParcelView {
    private String status;

    public void setStatus(String status) {
      this.status = status;
    }

    public String getStatus() {
      return status;
    }
  }
}
