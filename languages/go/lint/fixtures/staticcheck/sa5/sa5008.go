package sa5

type Broken struct {
	Total complex128 `json:",string"` // want SA5008
}

type Tagged struct {
	Total int `json:",string"`
}
