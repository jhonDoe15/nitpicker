package shop.lifecycle;

import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.stereotype.Component;

@Component
class NettyServer {
  private final EventLoopGroup boss = new NioEventLoopGroup(1);
  private final EventLoopGroup workers = new NioEventLoopGroup();

  @PostConstruct
  void start() throws InterruptedException {
    ServerBootstrap bootstrap = new ServerBootstrap().group(boss, workers).channel(NioServerSocketChannel.class);
    bootstrap.bind(1883).sync(); // violation: SpringStartupCleanup
  }

  @PreDestroy
  void stop() {
    boss.shutdownGracefully();
    workers.shutdownGracefully();
  }
}

@Component
class GuardedNettyServer {
  private final EventLoopGroup boss = new NioEventLoopGroup(1);
  private final EventLoopGroup workers = new NioEventLoopGroup();

  @PostConstruct
  void start() throws InterruptedException {
    try {
      new ServerBootstrap().group(boss, workers).channel(NioServerSocketChannel.class).bind(1884).sync();
    } catch (InterruptedException | RuntimeException failure) {
      stop();
      throw failure;
    }
  }

  @PreDestroy
  void stop() {
    boss.shutdownGracefully();
    workers.shutdownGracefully();
  }
}

@Component
class ScheduledServer implements InitializingBean {
  private final ScheduledExecutorService ticks = Executors.newSingleThreadScheduledExecutor();
  private final Server server = new Server();

  @Override
  public void afterPropertiesSet() {
    ticks.scheduleAtFixedRate(server::sweep, 1, 1, TimeUnit.SECONDS);
    server.start(); // violation: SpringStartupCleanup
  }

  @PreDestroy
  void stop() {
    ticks.shutdownNow();
    server.stop();
  }
}

@Component
class LazyPoolServer {
  private final ScheduledExecutorService ticks = Executors.newSingleThreadScheduledExecutor();
  private final Server server = new Server();

  @PostConstruct
  void start() {
    server.start();
    ticks.scheduleAtFixedRate(server::sweep, 1, 1, TimeUnit.SECONDS);
  }

  @PreDestroy
  void stop() {
    ticks.shutdownNow();
    server.stop();
  }
}

@Component
class ConstructorServer {
  private final EventLoopGroup loops = new NioEventLoopGroup();

  ConstructorServer() throws InterruptedException {
    ServerBootstrap bootstrap = new ServerBootstrap().group(loops).channel(NioServerSocketChannel.class);
    bootstrap.bind(1885).sync(); // violation: SpringStartupCleanup
  }

  @PreDestroy
  void stop() {
    loops.shutdownGracefully();
  }
}

final class Server {
  void start() {
  }

  void stop() {
  }

  void sweep() {
  }
}
