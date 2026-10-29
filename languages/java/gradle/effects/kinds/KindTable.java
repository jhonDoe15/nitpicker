package nitpicker.effects.kinds;

import java.util.List;
import java.util.regex.Pattern;

final class KindTable {
  record Entry(String type, String kind, Pattern include, Pattern exclude) {
    boolean allows(String name) {
      return exclude == null || !exclude.matcher(name).matches();
    }

    boolean matches(String name) {
      return (include == null || include.matcher(name).matches())
          && (exclude == null || !exclude.matcher(name).matches());
    }
  }

  static final String DATABASE = "database";
  static final String REMOTE = "remote";
  static final String MESSAGE = "message";
  private static final String DEFAULT_EXCLUDE =
      "(?!get\\w*By[A-Z]|getFirst|getTop|getAll|getOne|getReference|getFor)(get|is|has|set)[A-Z]\\w*"
          + "|mutate|close|unwrap|builder|newBuilder";
  private static final String REDIS_EXCLUDE =
      "opsFor\\w+|bound\\w+|getOperations|getConnectionFactory|get\\w*Serializer";
  private static final String REDIS_CLIENT_EXCLUDE = "close|isConnected|isBroken|getClient|getConnection\\w*"
      + "|pipelined|multi|getDB|getPool|resetState|setDataSource";
  private static final String AWS_EXCLUDE = "serviceName|close|utilities|waiter|serviceClientConfiguration";
  private static final String AWS = "software/amazon/awssdk/services/";

  static final List<Entry> ENTRIES = List.of(
      data("org/springframework/data/repository/Repository", null),
      data("jakarta/persistence/EntityManager", "find|getReference|persist|merge|remove|refresh|flush|lock"),
      data("javax/persistence/EntityManager", "find|getReference|persist|merge|remove|refresh|flush|lock"),
      data("jakarta/persistence/Query", "getResult\\w*|getSingleResult\\w*|executeUpdate"),
      data("javax/persistence/Query", "getResult\\w*|getSingleResult\\w*|executeUpdate"),
      data("java/sql/Statement", "execute\\w*"),
      data("org/springframework/jdbc/core/JdbcOperations", "query\\w*|update|batchUpdate|execute|call"),
      data("org/springframework/jdbc/core/namedparam/NamedParameterJdbcOperations",
          "query\\w*|update|batchUpdate|execute"),
      data("org/springframework/jdbc/core/simple/JdbcClient", "sql"),
      data("org/jooq/DSLContext", "fetch\\w*|select\\w*|insert\\w*|update\\w*|delete\\w*|merge\\w*|execute|batch\\w*"
          + "|resultQuery|query|truncate\\w*"),
      data("org/jooq/UpdatableRecord", "store|insert|update|delete|refresh|merge"),
      data("org/hibernate/SharedSessionContract", "get|find|load|persist|merge|save|update|delete|remove|refresh|flush"
          + "|saveOrUpdate|insert|upsert"),
      data("org/hibernate/query/SelectionQuery",
          "list|getResult\\w*|uniqueResult\\w*|getSingleResult\\w*|scroll|stream"),
      data("org/hibernate/query/MutationQuery", "executeUpdate"),
      data("org/springframework/data/mongodb/core/MongoOperations", null),
      data("org/springframework/data/mongodb/core/ReactiveMongoOperations", null),
      data("com/mongodb/client/MongoCollection", "find\\w*|insert\\w*|update\\w*|delete\\w*|replace\\w*|count\\w*"
          + "|aggregate|bulkWrite|distinct|estimatedDocumentCount"),
      redis("RedisOperations"),
      redis("ValueOperations"),
      redis("HashOperations"),
      redis("ListOperations"),
      redis("SetOperations"),
      redis("ZSetOperations"),
      redisClient("redis/clients/jedis/Jedis"),
      redisClient("redis/clients/jedis/UnifiedJedis"),
      redisClient("io/lettuce/core/api/sync/RedisCommands"),
      redisClient("io/lettuce/core/cluster/api/sync/RedisAdvancedClusterCommands"),
      data("org/springframework/r2dbc/core/DatabaseClient", "sql"),
      data("org/jetbrains/exposed/sql/QueriesKt", null),
      data("org/jetbrains/exposed/v1/jdbc/QueriesKt", null),
      data("org/jetbrains/exposed/sql/AbstractQuery", "iterator|count|empty|first\\w*|single\\w*|toList|forEach|map"),
      data("org/jetbrains/exposed/dao/EntityClass", "findById|find\\w*|all|count|new|reload|wrapRows"),
      data("org/jetbrains/exposed/v1/dao/EntityClass", "findById|find\\w*|all|count|new|reload|wrapRows"),
      aws("dynamodb/DynamoDbClient", DATABASE, null),
      aws("dynamodb/DynamoDbAsyncClient", DATABASE, null),
      data("software/amazon/awssdk/enhanced/dynamodb/DynamoDbTable",
          "getItem|putItem|updateItem|deleteItem|query|scan"),
      data("com/amazonaws/services/dynamodbv2/AmazonDynamoDB", null),
      remote("org/springframework/web/client/RestOperations", null),
      remote("org/springframework/web/client/RestClient", "get|post|put|patch|delete|head|options|method"),
      remote("org/springframework/web/reactive/function/client/WebClient",
          "get|post|put|patch|delete|head|options|method"),
      remote("java/net/http/HttpClient", "send|sendAsync"),
      remote("okhttp3/OkHttpClient", "newCall"),
      remote("okhttp3/Call", "execute|enqueue"),
      remote("org/apache/hc/client5/http/classic/HttpClient", "execute\\w*"),
      remote("org/apache/hc/client5/http/async/HttpAsyncClient", "execute\\w*"),
      remote("org/apache/http/client/HttpClient", "execute\\w*"),
      new Entry("io/grpc/stub/AbstractStub", REMOTE, null,
          Pattern.compile("with\\w*|getChannel|getCallOptions|build|equals|hashCode|toString")),
      remote("io/ktor/client/statement/HttpStatement", "execute|fetchResponse|body\\w*"),
      remote("io/ktor/client/HttpClient", "execute|request"),
      message("org/springframework/kafka/core/KafkaOperations", "send\\w*"),
      message("org/apache/kafka/clients/producer/Producer", "send"),
      message("org/springframework/amqp/core/AmqpTemplate",
          "send|convertAndSend|convertSendAndReceive\\w*|sendAndReceive"),
      message("com/rabbitmq/client/Channel", "basicPublish"),
      message("org/springframework/jms/core/JmsOperations", "send|convertAndSend|sendAndReceive"),
      message("jakarta/jms/MessageProducer", "send"),
      message("javax/jms/MessageProducer", "send"),
      message("jakarta/jms/JMSProducer", "send"),
      message("org/springframework/cloud/stream/function/StreamBridge", "send"),
      aws("sqs/SqsClient", MESSAGE, "send\\w*"),
      aws("sqs/SqsAsyncClient", MESSAGE, "send\\w*"),
      aws("sns/SnsClient", MESSAGE, "publish\\w*"),
      aws("sns/SnsAsyncClient", MESSAGE, "publish\\w*"),
      message("io/awspring/cloud/sqs/operations/SqsOperations", "send\\w*"),
      message("io/awspring/cloud/sns/core/SnsOperations", "send\\w*|convertAndSend|publish"),
      message("com/amazonaws/services/sqs/AmazonSQS", "sendMessage\\w*"),
      message("com/amazonaws/services/sns/AmazonSNS", "publish\\w*"),
      message("com/google/cloud/pubsub/v1/PublisherInterface", "publish"),
      message("com/google/cloud/spring/pubsub/core/publisher/PubSubPublisherOperations", "publish"),
      message("io/nats/client/Connection", "publish"),
      aws("sqs/SqsClient", REMOTE, null),
      aws("sqs/SqsAsyncClient", REMOTE, null),
      aws("sns/SnsClient", REMOTE, null),
      aws("sns/SnsAsyncClient", REMOTE, null),
      new Entry("software/amazon/awssdk/core/SdkClient", REMOTE, null, Pattern.compile(AWS_EXCLUDE)));

  private KindTable() {}

  private static Entry data(String type, String include) {
    return entry(type, DATABASE, include);
  }

  private static Entry remote(String type, String include) {
    return entry(type, REMOTE, include);
  }

  private static Entry message(String type, String include) {
    return entry(type, MESSAGE, include);
  }

  private static Entry aws(String type, String kind, String include) {
    return new Entry(AWS + type, kind, include == null ? null : Pattern.compile(include), Pattern.compile(AWS_EXCLUDE));
  }

  private static Entry redis(String type) {
    return new Entry("org/springframework/data/redis/core/" + type, DATABASE, null, Pattern.compile(REDIS_EXCLUDE));
  }

  private static Entry redisClient(String type) {
    return new Entry(type, DATABASE, null, Pattern.compile(REDIS_CLIENT_EXCLUDE));
  }

  private static Entry entry(String type, String kind, String include) {
    Pattern exclude = Pattern.compile(DEFAULT_EXCLUDE);
    return new Entry(type, kind, include == null ? null : Pattern.compile(include), include == null ? exclude : null);
  }
}
