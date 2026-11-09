package modernize

import "go/types"

func Names(tuple *types.Tuple, use func(string)) {
	for index := 0; index < tuple.Len(); index++ { // want stditerators
		use(tuple.At(index).Name())
	}
}

func NamesIterator(tuple *types.Tuple, use func(string)) {
	for variable := range tuple.Variables() {
		use(variable.Name())
	}
}
