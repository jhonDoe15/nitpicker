import { describe, expect, it } from 'vitest';
import { isBoilerplate } from './boilerplate.mjs';

describe('clones of declarations only', () => {
  it.each([
    [
      'typescript',
      'a class of accessors and fields',
      [
        'export class Point {',
        '  private readonly x: number;',
        '  @Input() label: string;',
        '  constructor(x: number) {',
        '    this.x = x;',
        '  }',
        '  get value(): number {',
        '    return this.x;',
        '  }',
        '}',
      ],
    ],
    [
      'python',
      'a dataclass with fields and an init',
      [
        '@dataclass',
        'class Record:',
        '    name: str = "a"',
        '    count: int',
        '    def __init__(self, name):',
        '        self.name = name',
        '        super().__init__()',
      ],
    ],
    [
      'kotlin',
      'a data class with enum constants',
      [
        'data class Person(',
        '    val name: String = "",',
        '    private val age: Int? = null,',
        ')',
        'FIRST("a", 1),',
        'SECOND("b", 2);',
      ],
    ],
  ])('treats %s %s as boilerplate', (syntax, _, lines) => {
    expect(isBoilerplate(lines, syntax)).toBe(true);
  });

  it.each([
    ['typescript', ['const total = items.reduce((sum, item) => sum + item, 0);']],
    ['typescript', ['  get value(): number {', '    return this.x + 1;', '  }']],
    ['python', ['class Record:', '    def total(self):', '        return sum(self.items)']],
    ['kotlin', ['data class Person(', '    val name: String = "",', ')', 'println(name)']],
  ])('treats %s code with logic as code', (syntax, lines) => {
    expect(isBoilerplate(lines, syntax)).toBe(false);
  });

  it('treats nothing at all as code', () => {
    expect(isBoilerplate(['', '  '], 'python')).toBe(false);
  });
});
