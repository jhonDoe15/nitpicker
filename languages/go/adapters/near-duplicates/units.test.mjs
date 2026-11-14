import { beforeAll, describe, expect, it } from 'vitest';
import { goProjectUnits } from './project-units.mjs';
import { goParser, inPackage } from './test-support/parse-go.mjs';
import { bodyOf, outline, statements } from './test-support/outline.mjs';

let parse;
let parser;

beforeAll(async () => {
  parse = await goParser();
  ({ parser } = parse);
});

function unitNamed(text, name) {
  return parse(text).find((unit) => unit.name === name);
}

function names(tree) {
  const pending = [tree];
  for (const node of pending) {
    pending.push(...node.children);
  }
  return pending.filter((node) => node.kind === 'name');
}

describe('Go units for the shared engine', () => {
  it('labels functions and methods with their parameter types and keeps repeats apart', () => {
    const text = inPackage(
      'func Sum(a, b int, rest ...string) (int, error) { return 0, nil }',
      'func (s *Server) Handle(w Writer) {}',
      'func init() { setup() }',
      'func init() { other() }',
      'func skipped(a int)',
    );

    expect(parse(text).map(({ name, final }) => [name, final])).toEqual([
      ['Sum(int,int,...string)', false],
      ['Server.Handle(Writer)', false],
      ['init()', true],
      ['init()#2', true],
    ]);
  });

  it('gives a function its result type, its parameters with the receiver first and a body', () => {
    const unit = unitNamed(
      inPackage('func (s *Server) Get(id int) (int, error) { return id, nil }'),
      'Server.Get(int)',
    );

    expect(outline(unit.tree.children[0])).toBe('type:int,error');
    expect(outline(unit.tree.children[1])).toBe(
      'parameters(parameter(type:*Server name:s) parameter(type:int name:id))',
    );
  });

  it('turns if, else if and an init statement into the shapes the engine reads', () => {
    const unit = unitNamed(
      inPackage(
        'func f(a int, err error) int {',
        '\tif v := g(); v > 0 && err != nil {',
        '\t\treturn 1',
        '\t} else if a == 2 {',
        '\t\ta = 5',
        '\t}',
        '\treturn 0',
        '}',
      ),
      'f(int,error)',
    );

    expect(statements(unit)).toEqual([
      'block(declare(none name:v call(name:g)) if(binary:&&(binary:>(name:v literal:0) binary:!=(name:err literal:null)) block(return(literal:1)) block(if(binary:==(name:a literal:2) block(evaluate(assign:=(name:a literal:5))) none))))',
      'return(literal:0)',
    ]);
  });

  it('numbers variables declared again in an inner scope so that a guard on one never covers the other', () => {
    const unit = unitNamed(
      inPackage(
        'func f(err error) {',
        '\tif err := g(); err != nil {',
        '\t\treturn',
        '\t}',
        '\tv, err := h()',
        '\tuse(v, err)',
        '}',
      ),
      'f(error)',
    );
    const errs = names(bodyOf(unit))
      .filter(({ text }) => text === 'err')
      .map(({ start, value }) => `${String(start)}:${value}`);

    expect(errs.toSorted()).toEqual(['4:err#1', '4:err#1', '7:err', '8:err']);
  });

  it('declares := variables with an integer type where the value is one, and splits multiple results', () => {
    const unit = unitNamed(
      inPackage(
        'func f(xs []int) {',
        "\tn, r := len(xs), 'a'",
        '\tvar u uint8 = 7',
        '\tv, ok := lookup(xs)',
        '\tvar a, b = 1, 2',
        '}',
      ),
      'f([]int)',
    );

    expect(statements(unit)).toEqual([
      'declare(type:int name:n call(name:len name:xs))',
      "declare(type:rune name:r literal:'a')",
      'declare(type:uint8 name:u literal:7)',
      'declare(none name:v none)',
      'declare(none name:ok none)',
      'evaluate(assign:=(expression:tuple(name:v name:ok) call(name:lookup name:xs)))',
      'declare(type:int name:a literal:1)',
      'declare(type:int name:b literal:2)',
    ]);
  });

  it('writes every Go integer form as the number it is', () => {
    const unit = unitNamed(
      inPackage('func f() { use(0x1F, 1_000, 0o17, 0b101, 017, 0XfF, 1e3, nil, true) }'),
      'f()',
    );
    const [call] = bodyOf(unit).children[0].children;

    expect(call.children.slice(1).map(({ literal, value }) => `${literal}:${value}`)).toEqual([
      'number:0x1f',
      'number:1000',
      'number:0o17',
      'number:0b101',
      'number:017',
      'number:0xff',
      'number:1e3',
      'null:null',
      'boolean:true',
    ]);
  });

  it('uses the loop shapes of the other languages', () => {
    const unit = unitNamed(
      inPackage(
        'func f(xs []int, n int) {',
        '\tfor i := 0; i < n; i++ {',
        '\t}',
        '\tfor n < 3 {',
        '\t}',
        '\tfor {',
        '\t\tbreak',
        '\t}',
        '\tfor k, v := range xs {',
        '\t\tuse(k, v)',
        '\t}',
        '}',
      ),
      'f([]int,int)',
    );

    expect(statements(unit)).toEqual([
      'for(block(declare(type:int name:i literal:0)) binary:<(name:i name:n) block(evaluate(update:postfix++(name:i))) block)',
      'while(binary:<(name:n literal:3) block)',
      'for(block none block block(break))',
      'foreach(none expression:tuple(name:k name:v) name:xs block(evaluate(call(name:use name:k name:v))))',
    ]);
  });

  it('qualifies package-level names by directory and imports by path, and leaves builtins alone', () => {
    const units = goProjectUnits(parser, [
      {
        file: 'a/x.go',
        text: 'package a\nimport (\n\t"strings"\n\tstr "fmt"\n)\nfunc f(s string) { helper(s, len(s), strings.ToUpper(s), str.Sprint(s)) }',
      },
      { file: 'a/h.go', text: 'package a\nfunc helper(s string, n int, a, b string) {}' },
    ]);
    const callee = (unit) => names(unit.tree).map(({ value }) => value);

    const seen = [...new Set(callee(units[0]))].toSorted((left, right) =>
      left.localeCompare(right),
    );

    expect(seen).toEqual(['a#helper', 'fmt', 'len', 's', 'strings']);
  });

  it('marks a name whose address is taken or that a method is called on', () => {
    const unit = unitNamed(
      inPackage(
        'func f(n, m int, c Counter, d *Counter) {',
        '	p := &n',
        '	c.Inc()',
        '	d.Inc()',
        '	use(p, m)',
        '}',
      ),
      'f(int,int,Counter,*Counter)',
    );
    const marked = new Set(
      names(unit.tree)
        .filter(({ addressTaken }) => addressTaken === true)
        .map(({ value }) => value),
    );

    expect([...marked].toSorted((left, right) => left.localeCompare(right))).toEqual(['c', 'n']);
  });

  it('skips a function with a goto or a syntax error', () => {
    const text = inPackage(
      'func jump(n int) {',
      'again:',
      '\tif n > 0 {',
      '\t\tgoto again',
      '\t}',
      '}',
      'func fine(n int) {}',
      'func broken(n int) { if n > 0 { return }',
    );

    expect(parse(text).map(({ name }) => name)).toEqual(['fine(int)']);
  });
});
