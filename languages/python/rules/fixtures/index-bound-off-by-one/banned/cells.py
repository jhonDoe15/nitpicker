def read_cell(cells, column):
    if column < 0 or column > len(cells):
        raise IndexError(column)
    return cells[column]
