import { Identifier } from "./identifier";
import { Imports } from "./imports";
import { isReference, OpenAPISchema, OpenAPIReference } from "./openapi";

/**
 * Get a runtime type using the given imports and context.
 *
 * @param imports The `Imports` instance to add any imports to.
 * @param context The context to report errors in.
 */
export type RuntimeTypeProvider = (imports: Imports) => RuntimeType;

export type RuntimeType = {
	/** The base name of the type. */
	typeName: string;

	/** Code to convert JSON to this type. */
	fromJson(): string;

	/** Code to convert a string param to this type. */
	fromJsonParam(): string;

	/** Code to convert this type to JSON. */
	toJson(): string;
};

/** Type for `boolean` values. */
export const BOOLEAN: RuntimeTypeProvider = (imports) => {
	const fromJson = () => {
		imports.addValidate("testBoolean");
		return "testBoolean";
	};

	return {
		typeName: "boolean",
		fromJson,
		toJson: fromJson,

		fromJsonParam() {
			imports.addValidate("testBooleanString");
			return "testBooleanString";
		},
	};
};

/** Type for `number` values. */
export const NUMBER: RuntimeTypeProvider = (imports) => {
	const fromJson = () => {
		imports.addValidate("testNumber");
		return "testNumber";
	};

	return {
		typeName: "number",
		fromJson,
		toJson: fromJson,

		fromJsonParam() {
			imports.addValidate("testNumberString");
			return "testNumberString";
		},
	};
};

/** Type for integer `number` values. */
export const INTEGER: RuntimeTypeProvider = (imports) => {
	const fromJson = () => {
		imports.addValidate("testInteger");
		return "testInteger";
	};

	return {
		typeName: "number",
		fromJson,
		toJson: fromJson,

		fromJsonParam() {
			imports.addValidate("testIntegerString");
			return "testIntegerString";
		},
	};
};

/** Type for `BigNumber` values. */
export const BIG_NUMBER: RuntimeTypeProvider = (imports) => {
	imports.addGlobal("bignumber.js", "BigNumber", true);

	const fromJson = () => {
		imports.addValidate("testBigNumber");
		return "testBigNumber";
	};

	return {
		typeName: "BigNumber",
		fromJson,
		toJson: fromJson,

		fromJsonParam() {
			imports.addValidate("testBigNumberString");
			return "testBigNumberString";
		},
	};
};

/** Type for integer `BigNumber` values. */
export const BIG_INTEGER: RuntimeTypeProvider = (imports) => {
	imports.addGlobal("bignumber.js", "BigNumber", true);

	const fromJson = () => {
		imports.addValidate("testBigInteger");
		return "testBigInteger";
	};

	return {
		typeName: "BigNumber",
		fromJson,
		toJson: fromJson,

		fromJsonParam() {
			imports.addValidate("testBigIntegerString");
			return "testBigIntegerString";
		},
	};
};

export const DATE: RuntimeTypeProvider = (imports) => {
	imports.addGlobal("luxon", "DateTime");

	const fromJson = () => {
		imports.addValidate("testDateString");
		return "testDateString";
	};

	return {
		typeName: "DateTime",
		fromJson,
		fromJsonParam: fromJson,

		toJson() {
			imports.addValidate("and");
			imports.addValidate("success");
			imports.addValidate("testType");
			return "and(testType(DateTime), (dt) => success(dt.toUTC().toISODate()))";
		},
	};
};

export const DATE_TIME: RuntimeTypeProvider = (imports) => {
	imports.addGlobal("luxon", "DateTime");

	const fromJson = () => {
		imports.addValidate("testDateTimeString");
		return "testDateTimeString";
	};

	return {
		typeName: "DateTime",
		fromJson,
		fromJsonParam: fromJson,

		toJson() {
			imports.addValidate("and");
			imports.addValidate("success");
			imports.addValidate("testType");
			return `and(testType(DateTime), (dt) => success(dt.toUTC().toISO()))`;
		},
	};
};

export const enumTypes: string[] = [];
export const objectTypes: string[] = [];

export function getRuntimeType(
	schema: OpenAPISchema | OpenAPIReference,
	imports: Imports,
	context: string
): RuntimeType {
	const props = new Set(Object.keys(schema));

	if (isReference(schema)) {
		props.delete("$ref");
		if (props.size) {
			throw `Unexpected properties of schema reference '${context}': ${Array.from(
				props
			)}`;
		}

		const match = /^#\/components\/schemas\/(\w+)$/.exec(schema.$ref);
		if (!match) {
			throw `Expected ref to be of form /^#\\/components\\/schemas\\/(\\w+)$/, but found: ${schema.$ref}`;
		}
		const ident = Identifier.fromCamel(match[1]);
		imports.addLocal("model", ident.kebab, ident.upperCamel);

		if (enumTypes.includes(ident.upperCamel)) {
			const fromJson = () => {
				imports.addValidate("testOneOf");
				imports.addLocal("model", ident.kebab, `values${ident.upperCamel}`);
				return `testOneOf(values${ident.upperCamel})`;
			};

			return {
				typeName: ident.upperCamel,
				fromJson,
				fromJsonParam: fromJson,
				toJson: fromJson,
			};
		}

		return {
			typeName: ident.upperCamel,

			fromJson() {
				const method = `test${ident.upperCamel}`;
				imports.addLocal("model", ident.kebab, method);
				return method;
			},

			fromJsonParam() {
				throw `Unexpected reference parameter '${context}'`;
			},

			toJson: () => {
				const method = `print${ident.upperCamel}`;
				imports.addLocal("model", ident.kebab, method);
				return method;
			},
		};
	}

	if (schema.oneOf) {
		props.delete("oneOf");
		if (props.size) {
			throw `Unexpected properties of oneOf schema '${context}': ${Array.from(
				props
			)}`;
		}

		const inner = schema.oneOf.map((s, i) =>
			getRuntimeType(s, imports, `${context}.oneOf[${i}]`)
		);

		return {
			typeName: inner.map(({ typeName }) => typeName).join(" | "),

			fromJson() {
				imports.addValidate("or");
				return `or(${inner.map(({ fromJson }) => fromJson()).join(", ")})`;
			},

			fromJsonParam() {
				imports.addValidate("or");
				return `or(${inner
					.map(({ fromJsonParam, fromJson }) =>
						fromJsonParam ? fromJsonParam() : fromJson()
					)
					.join(", ")})`;
			},

			toJson() {
				imports.addValidate("or");
				return `or(${inner
					.map(({ toJson, fromJson }) => (toJson ? toJson() : fromJson()))
					.join(", ")})`;
			},
		};
	}

	const {
		type,
		format,
		minLength,
		maxLength,
		additionalProperties,
		items,
	} = schema;
	props.delete("description");
	props.delete("type");
	switch (type) {
		case "string": {
			props.delete("format");
			switch (format) {
				case undefined:
				case "email":
				case "password":
				case "uuid": {
					props.delete("minLength");
					props.delete("maxLength");
					if (props.size) {
						throw `Unexpected properties of string schema '${context}': ${Array.from(
							props
						)}`;
					}

					const fromJson = () => {
						const options: string[] = [];

						if (minLength === 0) {
							throw `Unexpected minLength of 0 in '${context}'`;
						}
						if (maxLength === 0) {
							throw `Unexpected maxLength of 0 in '${context}'`;
						}
						if (minLength || maxLength) {
							imports.addValidate("testStringLength");
							options.push(`testStringLength(${minLength}, ${maxLength})`);
						}

						if (format === "email") {
							imports.addValidate("testEmail");
							options.push("testEmail");
						} else if (format === "uuid") {
							if (minLength) {
								throw `Unexpected minLength of UUID '${context}'`;
							}
							if (maxLength) {
								throw `Unexpected maxLength of UUID '${context}'`;
							}
							imports.addValidate("testUuid");
							options.push("testUuid");
						}

						imports.addValidate("testString");
						if (!options.length) {
							return "testString";
						}

						imports.addValidate("and");
						return `and(testString,${options})`;
					};

					return {
						typeName: "string",
						fromJson,
						fromJsonParam: fromJson,
						toJson: fromJson,
					};
				}

				case "date":
					if (props.size) {
						throw `Unexpected properties of date schema '${context}': ${Array.from(
							props
						)}`;
					}
					return DATE(imports);

				case "date-time":
					if (props.size) {
						throw `Unexpected properties of date-time schema '${context}': ${Array.from(
							props
						)}`;
					}
					return DATE_TIME(imports);

				default:
					throw `Unexpected string format '${format}' of '${context}'`;
			}
		}

		case "boolean":
			if (props.size) {
				throw `Unexpected properties of boolean schema '${context}': ${Array.from(
					props
				)}`;
			}
			return BOOLEAN(imports);

		case "integer":
		case "number": {
			let generator = type === "integer" ? INTEGER : NUMBER;
			if (format === "big") {
				generator = type === "integer" ? BIG_INTEGER : BIG_NUMBER;
				props.delete("format");
			}
			if (props.size) {
				throw `Unexpected properties of ${type} schema '${context}': ${Array.from(
					props
				)}`;
			}
			return generator(imports);
		}

		case "object": {
			props.delete("additionalProperties");
			if (props.size) {
				throw `Unexpected properties of map schema '${context}': ${Array.from(
					props
				)}`;
			}

			if (typeof additionalProperties === "boolean") {
				throw `Expected 'additionalProperties' inside '${context}' to be a schema or reference, but found: ${additionalProperties}`;
			}

			if (!additionalProperties) {
				throw `Expected 'additionalProperties' inside '${context}'`;
			}

			const { typeName, fromJson, toJson } = getRuntimeType(
				additionalProperties,
				imports,
				`${context}.additionalProperties`
			);

			return {
				typeName: `ReadonlyMap<string, ${typeName}>`,

				fromJson() {
					imports.addValidate("testMap");
					return `testMap(${fromJson()})`;
				},

				fromJsonParam() {
					throw `Unexpected map parameter '${context}'`;
				},

				toJson() {
					imports.addValidate("printMap");
					return `printMap(${toJson()})`;
				},
			};
		}

		case "array": {
			props.delete("items");
			if (props.size) {
				throw `Unexpected properties of array schema '${context}': ${Array.from(
					props
				)}`;
			}

			if (!items) {
				throw `Expected 'items' inside '${context}'`;
			}

			const { typeName, fromJson, fromJsonParam, toJson } = getRuntimeType(
				items,
				imports,
				`${context}.items`
			);

			return {
				typeName: `ReadonlyArray<${typeName}>`,

				fromJson() {
					imports.addValidate("testArray");
					return `testArray(${fromJson()})`;
				},

				fromJsonParam() {
					imports.addValidate("testParamArray");
					return `testParamArray(${fromJsonParam()})`;
				},

				toJson() {
					imports.addValidate("printArray");
					return `printArray(${toJson()})`;
				},
			};
		}

		default:
			throw `Unexpected type '${type}' of '${context}'`;
	}
}
