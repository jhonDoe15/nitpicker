package design

import "fmt"

type Repository interface { // want lone-interface
	Find(id string) (string, error)
}

type memoryRepository struct {
	rows map[string]string
}

func (repository *memoryRepository) Find(id string) (string, error) {
	row, found := repository.rows[id]
	if !found {
		return "", fmt.Errorf("find %s: %w", id, ErrMissing)
	}
	return row, nil
}

func NewRepository(rows map[string]string) Repository {
	return &memoryRepository{rows: rows}
}

type Shape interface {
	Area() float64
}

func Largest(shapes []Shape) Shape {
	var largest Shape = Square{}
	for _, shape := range shapes {
		if shape.Area() > largest.Area() {
			largest = shape
		}
	}
	return largest
}

type Square struct{ Side float64 }

func (square Square) Area() float64 { return square.Side * square.Side }

type Circle struct{ Radius float64 }

func (circle Circle) Area() float64 { return 3.14159 * circle.Radius * circle.Radius }

type Option interface {
	apply(*Repository)
}

type optionFunc func(*Repository)

func (option optionFunc) apply(target *Repository) { option(target) } // want ptrToRefParam

func WithNothing() Option { // want unused-option
	return optionFunc(func(*Repository) {})
}

func Apply(target *Repository, options ...Option) { // want ptrToRefParam
	for _, option := range options {
		option.apply(target)
	}
}

type Number interface {
	~int | ~float64
}

func Sum[T Number](values []T) T {
	var total T
	for _, value := range values {
		total += value
	}
	return total
}

type Finder interface {
	Find(id string) (string, error)
}

func Describe(finder Finder, id string) string {
	row, err := finder.Find(id)
	if err != nil { // want swallowed-error
		return "unknown"
	}
	return row
}

type Measure interface {
	Size() int
}

type fixed struct{ size int }

func (value fixed) Size() int { return value.size }

type Sized[T any] struct{ Items []T }

func (sized Sized[T]) Size() int { return len(sized.Items) }

func NewMeasure(size int) Measure {
	return fixed{size: size}
}

type flags struct{ verbose bool }

type Setting interface {
	Apply(*flags)
}

type verbose struct{}

func (verbose) Apply(target *flags) { target.verbose = true }

func Verbose() Setting {
	return verbose{}
}

func Configure(choices ...Setting) bool {
	var target flags
	for _, option := range choices {
		option.Apply(&target)
	}
	return target.verbose
}
