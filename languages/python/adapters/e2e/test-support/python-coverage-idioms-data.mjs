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

export const COLORS_EXTRA = lines(
  ...COLOR_NAME,
  '        case _:',
  '            assert_never(color)',
  '            return "other"',
);

export const LOOKALIKES = lines(
  'from typing import assert_never',
  '',
  '',
  'def sign(x: int) -> int:',
  '    if (',
  '        x > 0',
  '    ):',
  '        ...',
  '        return 1',
  '    return -1',
  '',
  '',
  'def label(flag: bool) -> str:',
  '    if flag:',
  '        return "on"',
  '    else:',
  '        assert_never(flag)',
);

export const LOOKALIKES_TEST = lines(
  'from demo import lookalikes',
  '',
  '',
  'def test_one_side():',
  '    assert lookalikes.sign(1) == 1',
  '    assert lookalikes.label(True) == "on"',
);

export const INLINE_NEVER = lines(
  'from typing import assert_never',
  '',
  '',
  'def pick(a: int) -> int:',
  '    if a == 1:',
  '        return 1',
  '    assert_never(a) if a > 100 else print(a)',
  '    return 3',
);

export const INLINE_NEVER_TEST = lines(
  'from demo import inline',
  '',
  '',
  'def test_pick():',
  '    assert inline.pick(1) == 1',
  '    assert inline.pick(2) == 3',
);
