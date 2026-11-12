import { Cart } from '../model/cart';

export class Left {
  run(): void {}
}

export class Right {
  run(): void {}
}

export interface Runner {
  run(): void;
}

export class Factory {
  static build(): Left {
    return new Left();
  }

  make(): Left {
    return Factory.build();
  }
}

export function byType(left: Left, right: Right): void {
  left.run();
  right.run();
}

export function byUnion(either: Left | Right): void {
  either.run();
}

export function byInterface(runner: Runner): void {
  runner.run();
}

export function shadowed(cart: Cart, carts: Cart[]): void {
  carts.forEach((cart) => {
    cart.add('x');
  });
  cart.add('y');
}

export class Holder {
  constructor(private left: Left) {}

  direct(): void {
    this.left.run();
  }

  nested(): void {
    const task = function (this: unknown) {
      this.left.run();
    };
    task.call(this);
    [1].forEach(() => {
      this.left.run();
    });
  }
}
