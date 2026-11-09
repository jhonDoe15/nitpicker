package simple

type Input struct {
	Name string
	Age  int
}

type Person struct {
	Name string
	Age  int
}

func Manual(input Input) Person {
	return Person{Name: input.Name, Age: input.Age} // want S1016
}

func Converted(input Input) Person {
	return Person(input)
}
