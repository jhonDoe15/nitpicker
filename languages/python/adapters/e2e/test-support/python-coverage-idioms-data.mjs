function lines(...rows) {
  return `${rows.join('\n')}\n`;
}

export const PORTS = lines(
  'from abc import ABC, abstractmethod',
  'from typing import Protocol',
  '',
  '',
  'class Writer(Protocol):',
  '    def write(self, text: str) -> object: ...',
  '',
  '    def writelines(',
  '        self,',
  '        rows: list[str],',
  '    ) -> object: ...',
  '',
  '    def flush(self) -> None:',
  '        """Flush."""',
  '        ...',
  '',
  '',
  'class Shape(ABC):',
  '    @abstractmethod',
  '    def area(self) -> float: ...',
  '',
  '',
  'class Square(Shape):',
  '    def area(self) -> float:',
  '        return 1.0',
  '',
  '',
  'def emit(writer: Writer) -> object:',
  '    return writer.write("x")',
);

export const PORTS_TEST = lines(
  'from demo import ports',
  '',
  '',
  'class Sink:',
  '    def write(self, text):',
  '        return text',
  '',
  '',
  'def test_emit():',
  '    assert ports.emit(Sink()) == "x"',
  '    assert ports.Square().area() == 1.0',
);

const COLOR_NAME = [
  'from enum import Enum',
  'from typing import assert_never',
  '',
  '',
  'class Color(Enum):',
  '    RED = 1',
  '    BLUE = 2',
  '',
  '',
  'def name(color: Color) -> str:',
  '    match color:',
  '        case Color.RED:',
  '            return "red"',
  '        case Color.BLUE:',
  '            return "blue"',
];

export const COLORS_OPEN = lines(...COLOR_NAME);

export const COLORS_EXHAUSTIVE = lines(
  ...COLOR_NAME,
  '        case _:',
  '            assert_never(color)',
);

export const COLORS_DEFAULT = lines(...COLOR_NAME, '        case _:', '            return "other"');

export const COLORS_TEST = lines(
  'from demo import colors',
  '',
  '',
  'def test_name():',
  '    assert colors.name(colors.Color.RED) == "red"',
  '    assert colors.name(colors.Color.BLUE) == "blue"',
);
