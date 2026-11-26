package shop.caching;

import java.util.List;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class OfficeDirectory {
  @Cacheable(cacheNames = "offices", key = "#tenant")
  public List<String> offices(String tenant, boolean includeClosed) { // violation: SpringCacheKeyOmitsParameter
    return includeClosed ? List.of(tenant, "closed") : List.of(tenant);
  }

  @Cacheable(cacheNames = "tellers", key = "'all'")
  public List<String> tellers(int page) { // violation: SpringCacheKeyOmitsParameter
    return List.of("teller-" + page);
  }

  @Cacheable(cacheNames = "branches", key = "#p0")
  public List<String> branches(String tenant, String region) { // violation: SpringCacheKeyOmitsParameter
    return List.of(tenant, region);
  }

  @Cacheable(cacheNames = "offices", key = "{#tenant, #includeClosed}")
  public List<String> officesByBoth(String tenant, boolean includeClosed) {
    return includeClosed ? List.of(tenant, "closed") : List.of(tenant);
  }

  @Cacheable(cacheNames = "offices", key = "#p0 + ':' + #a1")
  public List<String> officesByIndex(String tenant, boolean includeClosed) {
    return includeClosed ? List.of(tenant, "closed") : List.of(tenant);
  }

  @Cacheable(cacheNames = "offices", key = "#root.args")
  public List<String> officesByArguments(String tenant, boolean includeClosed) {
    return includeClosed ? List.of(tenant, "closed") : List.of(tenant);
  }

  @Cacheable(cacheNames = "offices")
  public List<String> officesByDefaultKey(String tenant, boolean includeClosed) {
    return includeClosed ? List.of(tenant, "closed") : List.of(tenant);
  }

  @Cacheable(cacheNames = "offices", key = "#tenant")
  public List<String> officesIgnoringTrace(String tenant, String traceId) {
    return List.of(tenant);
  }

  @Cacheable(cacheNames = "roles", key = "#key")
  public List<String> rolesByKey(List<Long> roleIds, String key) {
    return roleIds.stream().map(String::valueOf).toList();
  }

  @Cacheable(cacheNames = "roles", key = "#region")
  public List<String> rolesByRegion(List<Long> roleIds, String region) { // violation: SpringCacheKeyOmitsParameter
    return roleIds.stream().map(id -> region + id).toList();
  }

  @Cacheable(cacheNames = "regions", key = "#tenant")
  public String regionOf(String tenant, String region) {
    java.util.function.UnaryOperator<String> label =
        new java.util.function.UnaryOperator<>() {
          @Override
          public String apply(String region) {
            return region.trim();
          }
        };
    return label.apply(tenant);
  }

  @Cacheable(cacheNames = "regions", key = "#root.methodName")
  public String anyRegion(String tenant) { // violation: SpringCacheKeyOmitsParameter
    return tenant.trim();
  }

  @CachePut(cacheNames = "settings", key = "'current'")
  public String storeSettings(String settings) {
    return settings.trim();
  }
}
