export declare class Producer {
  send(record: { topic: string; messages: unknown[] }): Promise<void>;
  connect(): Promise<void>;
}
export declare class Kafka { producer(): Producer; }
