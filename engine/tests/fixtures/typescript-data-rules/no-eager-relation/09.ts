const builder = { manyToOne: () => builder, eager: () => builder };
builder.manyToOne().eager();