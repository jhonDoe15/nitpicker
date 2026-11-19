import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-dropped-delegate-result.mts';

const tester = typescriptRuleTester();
const errors = [{ messageId: 'droppedDelegateResult' as const }];

const MONGOOSE = [
  'Document.prototype.update = function update() {',
  '  const args = Array.prototype.slice.call(arguments);',
  '  args.unshift({ _id: this._id });',
  '  this.constructor.update.apply(this.constructor, args);',
  '};',
].join('\n');

tester.run('no-dropped-delegate-result', rule, {
  valid: [
    'Document.prototype.update = function update() { return this.constructor.update.apply(this.constructor, []); };',
    'class A { update(x) { return this.delegate.update(x); } }',
    'class A { update(x) { this.delegate.save(x); } }',
    'class A { update(x) { this.delegate.update(x); this.touched = true; } }',
    'class A { update(x) { if (x) { this.delegate.update(x); } } }',
    'class A { update(x) { this.update(x - 1); } }',
    'function update(x) { update(x - 1); }',
    'function update(x) { update.call(null, x); }',
    'class A { update(x): void { this.delegate.update(x); } }',
    'class A { update(x): Promise<void> { this.delegate.update(x); } }',
    'class A { componentDidMount() { this.props.store.componentDidMount(); } }',
    'class A { componentDidUpdate(prev) { super.componentDidUpdate(prev); } }',
    'class A { ngOnInit() { this.base.ngOnInit(); } }',
    'class A { onChange(event) { this.parent.onChange(event); } }',
    'class A { handleClick(event) { this.parent.handleClick(event); } }',
    'class A { constructor(x) { super.constructor(x); } }',
    'class A { set value(x) { this.delegate.value(x); } }',
    'class A { *update() { this.delegate.update(); } }',
    'const o = { update(x) { return this.delegate.update(x); } };',
    'const o = { get update() { this.delegate.update(); } };',
    'const fetch = async () => { await this.client.fetch(); return 1; };',
    'class A { update = (x) => this.delegate.update(x); }',
    'class A { update(x) { const y = this.delegate.update(x); } }',
    'class A { update(x) { [this.delegate.update(x)]; } }',
  ],
  invalid: [
    {
      code: MONGOOSE,
      errors: [
        {
          messageId: 'droppedDelegateResult',
          data: { name: 'update', callee: 'this.constructor.update' },
        },
      ],
    },
    { code: 'class A { update(x) { this.delegate.update(x); } }', errors },
    { code: 'class A { update(x) { super.update(x); } }', errors },
    { code: 'class A { static update(x) { Model.update(x); } }', errors },
    { code: 'class A { update(x) { this.delegate.update.call(this.delegate, x); } }', errors },
    { code: 'class A { update(x) { this.delegate?.update(x); } }', errors },
    { code: 'class A { update(x) { this.delegate!.update(x); } }', errors },
    { code: 'class A { update = (x) => { this.delegate.update(x); }; }', errors },
    { code: 'class A { update = function (x) { this.delegate.update(x); }; }', errors },
    { code: 'class A { async update(x) { await this.delegate.update(x); } }', errors },
    { code: 'const o = { update(x) { this.delegate.update(x); } };', errors },
    { code: 'const o = { update: function (x) { this.delegate.update(x); } };', errors },
    { code: 'A.prototype.update = function (x) { this.delegate.update(x); };', errors },
    { code: 'const wrapper = function update(x) { Model.update(x); };', errors },
    { code: 'function update(x) { Model.update(x); }', errors },
    {
      code: 'class A { update(x) { const y = [x]; y.push(1); this.delegate.update(...y); } }',
      errors,
    },
  ],
});

tester.run('no-dropped-delegate-result without types skips library mutators', rule, {
  valid: [
    'class Stack { push(item) { this.items.push(item); } }',
    'class Stack<T> { private items: T[] = []; push(item: T) { this.items.push(item); } }',
    'class M { set(k, v) { this.map.set(k, v); } delete(k) { this.map.delete(k); } add(v) { this.set.add(v); } }',
    'class E { on(n, f) { this.emitter.on(n, f); } once(n, f) { this.emitter.once(n, f); } emit(n) { this.emitter.emit(n); } }',
    'class S { write(c) { this.socket.write(c); } end() { this.stream.end(); } close() { this.server.close(); } }',
  ],
  invalid: [
    { code: 'class A { push(x) { super.push(x); } }', errors },
    { code: 'class A { push(x) { this.constructor.push(x); } }', errors },
    { code: 'class A { static add(x) { this.constructor.add.call(this, x); } }', errors },
  ],
});
