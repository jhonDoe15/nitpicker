// Package entsql stands in for entgo.io/ent/dialect/entsql in the fixtures.
package entsql

type Annotation struct{ Skip bool }

func (Annotation) Name() string {
	return "EntSQL"
}

type IndexAnnotation struct{ Where string }

func (IndexAnnotation) Name() string {
	return "EntSQLIndexes"
}

func IndexWhere(pred string) *IndexAnnotation {
	return &IndexAnnotation{Where: pred}
}
