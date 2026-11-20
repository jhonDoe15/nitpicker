function decorate(..._inputs: unknown[]): any {
  return () => undefined;
}

@decorate(() => 1)
export class Service extends (decorate(() => 2) as { new (): object }) implements Iterable<number> {
  static count = 0;
  static {
    Service.count += 1;
    if (Service.count > 1) {
      Service.count = [1].map(() => 1).length;
    }
  }
  private readonly handlers = new Map<string, () => void>();
  handler = () => {
    return this.handlers;
  };
  wrapped = ((value: number) => value) as (value: number) => number;
  computed = [1, 2].map((value) => value + 1);
  declare ambient: string;
  #secret = () => 1;
  ['literal' + 'key'] = () => 2;
  accessor tracked = [3].map(() => 3);
  constructor(private readonly name: string, public age = 1) {
    super();
  };
  @decorate()
  get label(): string {
    return this.name;
  }
  set label(value: string) {
    void value;
  };;
  static create(): Service;
  static create(name: string): Service;
  static create(name = 'x'): Service {
    return new Service(name);
  }
  async *[Symbol.iterator](): any {
    yield 1;
  }
  #hidden() {
    return this.#secret;
  }
  'quoted'() {
    return 1;
  }
  [key: string]: unknown;
}

export abstract class Base {
  abstract run(): void;
  abstract get size(): number;
  protected abstract value: number;
  optional?(): void;
}

export default class extends Base {
  value = 1;
  run() {}
  get size() {
    return 1;
  }
}

export const Anonymous = class {
  go() {
    return class Inner {
      stay = () => 1;
    };
  }
};

const holder = {
  Kind: class {
    method() {}
  },
};
void holder;

namespace Legacy {
  export class Inside {
    go() {}
  }
  export function helper() {}
}
void Legacy;
