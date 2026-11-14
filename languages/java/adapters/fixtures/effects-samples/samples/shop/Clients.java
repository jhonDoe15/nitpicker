package shop;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import com.datastax.oss.driver.api.core.cql.SyncCqlSession;
import com.querydsl.core.Fetchable;
import jakarta.ws.rs.client.Invocation;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.neo4j.driver.QueryRunner;
import retrofit2.Call;

@Mapper
interface UserMapper {
  String nameOf(long id);
}

class Clients {
  Call<String> call;
  Invocation invocation;
  UserMapper mapper;
  Fetchable<String> query;
  QueryRunner graph;
  SyncCqlSession cql;
  ElasticsearchClient elastic;

  void retrofit(List<Long> ids) {
    for (long id : ids) {
      call.execute();
    }
  }

  void jaxRs(List<Long> ids) {
    for (long id : ids) {
      invocation.invoke();
    }
  }

  void myBatis(List<Long> ids) {
    for (long id : ids) {
      mapper.nameOf(id);
    }
  }

  void queryDsl(List<Long> ids) {
    for (long id : ids) {
      query.fetch();
    }
  }

  void neo4j(List<Long> ids) {
    for (long id : ids) {
      graph.run("MATCH (n) RETURN n");
    }
  }

  void cassandra(List<Long> ids) {
    for (long id : ids) {
      cql.execute("SELECT 1");
    }
  }

  void elasticsearch(List<Long> ids) {
    for (long id : ids) {
      elastic.search("q");
    }
  }
}
