if (process.argv.length !== 5) {
	console.error(
		"Usage: npx openapi-typescript /path/to/openapi.yaml (api | client) /output/directory"
	);
	process.exit(1);
}

const [, , specFile, mode, outputDir] = process.argv;

import fs from "fs";
if (!fs.existsSync(specFile)) {
	console.error(`Spec file ${specFile} did not exist`);
	process.exit(1);
}

if (mode !== "api" && mode !== "client") {
	console.error(`Mode not supported: ${mode}`);
	process.exit(1);
}

import rimraf from "rimraf";
rimraf.sync(outputDir);
fs.mkdirSync(outputDir, { recursive: true });

const specString = fs.readFileSync(specFile, "utf8");

import YAML from "yaml";
const { components, paths, tags = [] }: OpenAPI = YAML.parse(specString);
if (!components) throw "Expected components to be defined!";
const { schemas, securitySchemes } = components;
if (!schemas) throw "Expected schemas to be defined!";

type UrlPart = {
	type: "literal" | "param";
	value: string;
};

type Url = string | { original: string; parts: UrlPart[] };

const urlToString = (url: Url): string =>
	typeof url === "string" ? url : url.original;

type OperationExtended = OpenAPIOperation & {
	method: HttpMethod;
	url: Url;
};

type HttpMethod =
	| "GET"
	| "PUT"
	| "POST"
	| "DELETE"
	| "OPTIONS"
	| "HEAD"
	| "PATCH"
	| "TRACE";

const isHttpMethod = (s: string): s is HttpMethod =>
	[
		"GET",
		"PUT",
		"POST",
		"DELETE",
		"OPTIONS",
		"HEAD",
		"PATCH",
		"TRACE",
	].includes(s);

const operationsByTag = tags.reduce<{
	[name: string]: Omit<OpenAPITag, "name"> & {
		operations: OperationExtended[];
	};
}>(
	(o, { name, ...tag }) => ({
		...o,
		[name]: { ...tag, operations: [] },
	}),
	{}
);
for (const [urlString, methods] of Object.entries(paths)) {
	const parts: UrlPart[] = [];
	let urlRest = urlString;
	let match: RegExpExecArray | null;
	let anyParams = false;
	while ((match = /^(.*?)\{(\w+)\}/.exec(urlRest)) !== null) {
		anyParams = true;
		const {
			0: { length },
			1: start,
			2: param,
		} = match;
		if (start) {
			parts.push({ type: "literal", value: start });
		}
		parts.push({ type: "param", value: param });
		urlRest = urlRest.substring(length);
	}
	if (urlRest) {
		parts.push({ type: "literal", value: urlRest });
	}
	const url: Url = anyParams ? { original: urlString, parts } : urlString;
	const entries = Object.entries(methods).map<[string, OpenAPIOperation]>(
		([k, v]) => [k.toUpperCase(), v as OpenAPIOperation]
	);
	for (const [method, { tags, ...operation }] of entries) {
		if (!isHttpMethod(method)) continue;
		if (!Array.isArray(tags) || tags.length !== 1) {
			throw `Expected 1 tag for ${method} ${urlString}, but found: ${tags}`;
		}
		const [tagName] = tags;
		const tag =
			operationsByTag[tagName] ||
			(operationsByTag[tagName] = { operations: [] });
		tag.operations.push({ ...operation, url, method });
	}
}

class StringBuilder {
	private parts: (string | StringBuilder | Imports)[] = [];

	append(part: string | number | boolean | StringBuilder | Imports): this {
		if (typeof part === "number" || typeof part === "boolean")
			this.parts.push(part.toString());
		else this.parts.push(part);
		return this;
	}

	toString(): string {
		return this.parts.join("");
	}
}

class Imports {
	private imports: {
		[file: string]: {
			named: Set<string>;
		};
	} = {};

	constructor(private folder: "api" | "client" | "model" | undefined) {}

	addGlobal(file: string, namedImport: string) {
		const { named } =
			this.imports[file] || (this.imports[file] = { named: new Set() });
		named.add(namedImport);
	}

	addLocal(
		folder: "api" | "client" | "model" | undefined,
		file: string,
		namedImport: string
	) {
		let relative;
		if (folder === this.folder) relative = ".";
		else if (!folder) relative = "..";
		else if (!this.folder) relative = `./${folder}`;
		else relative = `../${folder}`;
		this.addGlobal(`${relative}/${file}`, namedImport);
	}

	addValidate(namedImport: string) {
		this.addLocal(undefined, "validate", namedImport);
	}

	toString(): string {
		const b = new StringBuilder();
		for (const [file, { named: namedSet }] of Object.entries(
			this.imports
		).sort(([a], [b]) => a.localeCompare(b))) {
			const named = Array.from(namedSet).sort((a, b) => a.localeCompare(b));
			b.append("import{");
			named.forEach((n, i) => {
				if (i > 0) b.append(",");
				b.append(n);
			});
			b.append("}from");
			b.append(JSON.stringify(file));
			b.append(";");
		}
		return b.toString();
	}
}

const capitalize = (s: string) => `${s[0].toUpperCase()}${s.substring(1)}`;
const uncapitalize = (s: string) => `${s[0].toLowerCase()}${s.substring(1)}`;

class Identifier {
	public readonly lowerCamel: string;
	public readonly upperCamel: string;
	public readonly display: string;
	public readonly kebab: string;

	private constructor(words: string[]) {
		let lowerCamel = "";
		let upperCamel = "";
		let display = "";
		let kebab = "";
		words.forEach((word, i) => {
			const lower = word.toLowerCase();
			const capital = capitalize(lower);
			if (i > 0) {
				display += " ";
				kebab += "-";
				lowerCamel += capital;
			} else {
				lowerCamel += lower;
			}
			upperCamel += capital;
			display += word;
			kebab += lower;
		});
		this.lowerCamel = lowerCamel;
		this.upperCamel = upperCamel;
		this.display = display;
		this.kebab = kebab;
	}

	static readonly fromCamel = (s: string): Identifier =>
		new Identifier(s.trim().split(/(?<=[^A-Z])(?=[A-Z])/));

	static readonly fromWords = (s: string): Identifier =>
		new Identifier(s.trim().split(/\s+/));
}

const getComponentFromRef = (ref: string) => {
	const match = /^#\/components\/schemas\/(\w+)$/.exec(ref);
	if (!match)
		throw `Expected ref to be of form /^#\\/components\\/schemas\\/(\\w+)$/, but found: ${ref}`;
	return Identifier.fromCamel(match[1]);
};

const splitLines = (s: string | undefined) =>
	s ? s.trim().split(/\r?\n/) : [];

const appendMarkdownAsComment = (
	b: StringBuilder,
	...lines: (string | undefined)[]
): StringBuilder => {
	// remove empty elements from the end
	while (lines.length && !lines[lines.length - 1]) lines.pop();

	// remove empty elements from the beginning
	while (lines.length && !lines[0]) lines.shift();

	if (lines.length === 1) {
		b.append("\n/** ");
		b.append(lines[0]!);
		b.append(" */\n");
	} else if (lines.length) {
		b.append("\n/**\n");
		let lastEmpty = false;
		lines.forEach((x) => {
			if (x) {
				lastEmpty = false;
				b.append(" * ");
				b.append(x);
				b.append("\n");
			} else {
				if (!lastEmpty) {
					b.append(" *\n");
				}
				lastEmpty = true;
			}
		});
		b.append(" */\n");
	}

	return b;
};

const writeEnumModel = (
	enumName: string,
	{ description, enum: enumValues }: OpenAPISchema
): string => {
	if (!enumValues) throw `Expected enum values in ${enumName}`;
	const b = new StringBuilder();
	b.append('import { validateOneOf } from "../validate";\n\n');
	appendMarkdownAsComment(b, ...splitLines(description));
	b.append("export type ");
	b.append(enumName);
	b.append(" = ");
	enumValues.forEach((enumValue, i) => {
		if (i > 0) b.append(" | ");
		b.append(JSON.stringify(enumValue));
	});
	b.append(";\n\n/** Array of ");
	b.append(enumName);
	b.append(" values. */\nexport const values");
	b.append(enumName);
	b.append(": readonly ");
	b.append(enumName);
	b.append("[] = [");
	enumValues.forEach((enumValue, i) => {
		if (i > 0) b.append(",");
		b.append(JSON.stringify(enumValue));
	});
	b.append("];\n\n/** Convert from ");
	b.append(enumName);
	b.append(" to JSON. */\nexport const print");
	b.append(enumName);
	b.append(" = (value: ");
	b.append(enumName);
	b.append("): any => value;\n\n/** Convert from JSON to ");
	b.append(enumName);
	b.append(". */\nexport const validate");
	b.append(enumName);
	b.append(" = (json: any, context: string[] = []): ");
	b.append(enumName);
	b.append(" => validateOneOf(json, values");
	b.append(enumName);
	b.append(', [...context, "');
	b.append(enumName);
	b.append('"]);');
	return b.toString();
};

const writeObjectModel = (
	objectName: string,
	objectSchema: OpenAPISchema
): string => {
	if (!objectSchema.properties) throw `Expected properties in ${objectName}`;
	const b = new StringBuilder();
	const imports = new Imports("model");
	imports.addValidate("validateObject");

	const propertyBuilder = new StringBuilder();
	const printBuilder = new StringBuilder();
	const validateBuilder = new StringBuilder();

	for (const [property, propertySchema] of Object.entries(
		objectSchema.properties
	)) {
		const required =
			objectSchema.required !== undefined &&
			objectSchema.required.includes(property);

		const { typeName, print, validate } = getTypeFromSchema(
			imports,
			propertySchema,
			required,
			`...context, "${objectName}", "${property}"`
		);

		if (!isReference(propertySchema)) {
			appendMarkdownAsComment(
				propertyBuilder,
				...splitLines(propertySchema.description)
			);
		}

		propertyBuilder.append("readonly ");
		propertyBuilder.append(property);
		if (!required) propertyBuilder.append("?");
		propertyBuilder.append(": ");
		propertyBuilder.append(typeName);
		propertyBuilder.append(";");

		printBuilder.append(property);
		printBuilder.append(": ");
		printBuilder.append(
			print ? print(`value.${property}`) : `value.${property}`
		);
		printBuilder.append(",");

		validateBuilder.append(property);
		validateBuilder.append(": ");
		validateBuilder.append(validate(`json.${property}`));
		validateBuilder.append(",");
	}

	b.append(imports);
	b.append("\n\n");
	appendMarkdownAsComment(b, ...splitLines(objectSchema.description));
	b.append("export type ");
	b.append(objectName);
	b.append(" = {");
	b.append(propertyBuilder);
	b.append("};\n\n/** Convert from ");
	b.append(objectName);
	b.append(" to JSON. */\nexport const print");
	b.append(objectName);
	b.append(" = (value: ");
	b.append(objectName);
	b.append("): any => ({");
	b.append(printBuilder);
	b.append("});\n\n/** Convert from JSON to ");
	b.append(objectName);
	b.append(". */\nexport const validate");
	b.append(objectName);
	b.append(" = (json: any, context: string[] = []): ");
	b.append(objectName);
	b.append(" => validateObject(json, context) && ({");
	b.append(validateBuilder);
	b.append("});");
	return b.toString();
};

type RuntimeType = {
	typeName: string;
	print?: (name: string) => string;
	validate: (name: string) => string;
};

const getTypeFromSchema = (
	imports: Imports,
	schema: OpenAPISchema | OpenAPIReference,
	required: boolean,
	context: string
): RuntimeType => {
	const props = new Set(Object.keys(schema));
	if (isReference(schema)) {
		props.delete("$ref");
		if (props.size) {
			throw `Unexpected properties of schema reference '${context}': ${Array.from(
				props
			)}`;
		}
		const ident = getComponentFromRef(schema.$ref);
		imports.addLocal("model", ident.kebab, ident.upperCamel);
		return {
			typeName: required ? ident.upperCamel : `${ident.upperCamel} | undefined`,
			print: (name) => {
				const printMethod = `print${ident.upperCamel}`;
				imports.addLocal("model", ident.kebab, printMethod);
				if (required) {
					return `${printMethod}(${name})`;
				}
				imports.addValidate("isUndefined");
				return `isUndefined(${name}) ? undefined : ${printMethod}(${name})`;
			},
			validate: (name) => {
				const validateMethod = `validate${ident.upperCamel}`;
				imports.addLocal("model", ident.kebab, validateMethod);
				if (required) {
					return `${validateMethod}(${name}, [${context}])`;
				}
				imports.addValidate("isUndefined");
				return `isUndefined(${name}) ? undefined : ${validateMethod}(${name}, [${context}])`;
			},
		};
	}

	props.delete("description");
	props.delete("type");
	const {
		type,
		format,
		minLength,
		maxLength,
		additionalProperties,
		items,
	} = schema;
	switch (type) {
		case "string": {
			switch (format) {
				case undefined:
				case "email": {
					props.delete("minLength");
					props.delete("maxLength");
					if (props.size) {
						throw `Unexpected properties of string schema '${context}': ${Array.from(
							props
						)}`;
					}

					return {
						typeName: required ? "string" : "string | undefined",
						validate: (name) => {
							const options: string[] = [];
							if (minLength) {
								options.push(`minLength: ${minLength}`);
							}
							if (maxLength === 0) {
								throw `Unexpected maxLength of 0 in '${context}'`;
							}
							if (maxLength) {
								options.push(`maxLength: ${maxLength}`);
							}
							if (format === "email") {
								options.push("email: true");
							}
							const optionsString = options.length
								? `, { ${options.join(", ")} }`
								: "";
							imports.addValidate("validateString");
							if (required) {
								return `validateString(${name}, [${context}]${optionsString})`;
							}
							imports.addValidate("validateOpt");
							if (!optionsString) {
								return `validateOpt(${name}, validateString, [${context}])`;
							}
							return `validateOpt(${name}, (thing, context) => validateString(thing, context${optionsString}), [${context}])`;
						},
					};
				}

				case "date": {
					props.delete("format");
					if (props.size) {
						throw `Unexpected properties of date schema '${context}': ${Array.from(
							props
						)}`;
					}

					return {
						typeName: "Date",
						print: (name) => {
							if (required) {
								return `${name}.toISOString().substring(0, 10)`;
							}
							imports.addValidate("isUndefined");
							return `isUndefined(${name}) ? undefined : ${name}.toISOString().substring(0, 10)`;
						},
						validate: (name) => {
							imports.addValidate("validateDate");
							if (required) {
								return `validateDate(${name}, [${context}])`;
							}
							imports.addValidate("validateOpt");
							return `validateOpt(${name}, validateDate, [${context}])`;
						},
					};
				}

				case "date-time": {
					props.delete("format");
					if (props.size) {
						throw `Unexpected properties of date-time schema '${context}': ${Array.from(
							props
						)}`;
					}

					return {
						typeName: "Date",
						print: (name) => {
							if (required) {
								return `${name}.toISOString()`;
							}
							imports.addValidate("isUndefined");
							return `isUndefined(${name}) ? undefined : ${name}.toISOString()`;
						},
						validate: (name) => {
							imports.addValidate("validateDateTime");
							if (required) {
								return `validateDateTime(${name}, [${context}])`;
							}
							imports.addValidate("validateOpt");
							return `validateOpt(${name}, validateDateTime, [${context}])`;
						},
					};
				}

				default:
					throw `Unexpected string format '${format}' of '${context}'`;
			}
		}

		case "boolean":
		case "integer":
		case "number": {
			if (props.size) {
				throw `Unexpected properties of ${type} schema '${context}': ${Array.from(
					props
				)}`;
			}

			const typeName = type === "integer" ? "number" : type;
			return {
				typeName: required ? typeName : `${typeName} | undefined`,
				validate: (name) => {
					const validateMethod =
						format === "email"
							? "validateEmail"
							: `validate${capitalize(type)}`;
					imports.addValidate(validateMethod);
					if (required) {
						return `${validateMethod}(${name}, [${context}])`;
					}
					imports.addValidate("validateOpt");
					return `validateOpt(${name}, ${validateMethod}, [${context}])`;
				},
			};
		}

		case "object": {
			props.delete("additionalProperties");
			if (props.size) {
				throw `Unexpected properties of array schema '${context}': ${Array.from(
					props
				)}`;
			}

			if (typeof additionalProperties === "boolean") {
				throw `Expected 'additionalProperties' inside '${context}' to be a schema or reference, but found: ${additionalProperties}`;
			}

			if (!additionalProperties) {
				throw `Expected 'additionalProperties' inside '${context}'`;
			}

			const { typeName, print, validate } = getTypeFromSchema(
				imports,
				additionalProperties,
				true,
				`${context}, "additionalProperties"`
			);
			return {
				typeName: required
					? `Record<string, ${typeName}>`
					: `Record<string, ${typeName}> | undefined`,
				...(print && {
					print: (name) => {
						const inner = print("x");
						imports.addValidate("printRecord");
						if (required) {
							return `printRecord(${name}, (x) => ${inner})`;
						}
						imports.addValidate("isUndefined");
						return `isUndefined(${name}) ? undefined : printRecord(${name}, (x) => ${inner})`;
					},
				}),
				validate: (name) => {
					const inner = validate("x");
					imports.addValidate("validateRecord");
					if (required) {
						return `validateRecord(${name}, (x) => ${inner}, [${context}])`;
					}
					imports.addValidate("validateOpt");
					return `validateOpt(${name}, (thing, context) => validateRecord(thing, (x) => ${inner}, context), [${context}])`;
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

			const { typeName, print, validate } = getTypeFromSchema(
				imports,
				items,
				true,
				`${context}, "items"`
			);
			return {
				typeName: required ? `${typeName}[]` : `${typeName}[] | undefined`,
				...(print && {
					print: (name) => {
						const inner = print("x");
						if (required) {
							return `${name}.map((x) => ${inner})`;
						}
						imports.addValidate("isUndefined");
						return `isUndefined(${name}) ? undefined : ${name}.map((x) => ${inner})`;
					},
				}),
				validate: (name) => {
					const inner = validate("x");
					imports.addValidate("validateArray");
					if (required) {
						return `validateArray(${name}, (x) => ${inner}, [${context}])`;
					}
					imports.addValidate("validateOpt");
					return `validateOpt(${name}, (thing, context) => validateArray(thing, (x) => ${inner}, context), [${context}])`;
				},
			};
		}

		default:
			throw `Unexpected type '${type}' of '${context}'`;
	}
};

const getTypeFromContent = (
	imports: Imports,
	content: Record<string, OpenAPIMediaType> | undefined,
	required: boolean,
	context: string
) => {
	if (!content) return;
	const { "application/json": jsonContent } = content;
	if (!jsonContent) return;
	const { schema } = jsonContent;
	if (!schema) return;
	return getTypeFromSchema(imports, schema, required, context);
};

const writeApi = (
	tag: Identifier,
	tagDescription: string | undefined,
	operations: OperationExtended[]
): string => {
	const imports = new Imports("api");
	imports.addLocal(undefined, "base-api", "BaseApi");
	imports.addGlobal("express", "Express");
	imports.addGlobal("express", "Request");
	imports.addGlobal("express", "Response");

	const abstractMethodLines = new StringBuilder();
	const registerLines = new StringBuilder();

	for (const {
		summary,
		description,
		method,
		operationId,
		parameters = [],
		requestBody,
		responses,
		security,
		tags,
		url,
		...otherOperationProps
	} of operations) {
		if (!operationId) {
			throw `Expected operation ID for ${method} ${urlToString(url)}`;
		}

		const paramNames: string[] = [];
		const paramsWithTypes: string[] = [];
		const paramLines = new StringBuilder();
		const paramJsDoc: string[] = [];

		const addJsDoc = (prefix: string, doc: string) =>
			paramJsDoc.push(prefix, ...splitLines(doc).map((l) => `  ${l}`));

		if (isReference(requestBody)) {
			throw `Unexpected reference in request body ${operationId}`;
		}

		if (requestBody) {
			const requestType = getTypeFromContent(
				imports,
				requestBody?.content,
				requestBody.required || false,
				`"${operationId}", "requestBody"`
			);
			if (requestType) {
				if (!requestBody.required) {
					throw `Body is not required for operation ${operationId}`;
				}
				paramNames.push("body");
				paramsWithTypes.push(`body: ${requestType.typeName}`);

				paramLines.append("const body = ");
				paramLines.append(requestType.validate("req.body"));
				paramLines.append(";");

				addJsDoc("@param body", requestBody.description || "Request body.");
			}
		}

		for (const parameter of parameters) {
			if (isReference(parameter)) {
				throw `Unexpected reference in parameter of ${operationId}`;
			}
			const {
				name: paramName,
				in: paramType,
				required: paramRequired = false,
				description: paramDescription,
				schema: paramSchema,
			} = parameter;
			if (!paramSchema) {
				throw `Expected schema inside of parameter ${paramName} of ${operationId}`;
			}

			const type = getTypeFromSchema(
				imports,
				paramSchema,
				paramRequired,
				`"${operationId}", "${paramType}", "${paramName}"`
			);
			paramNames.push(paramName);
			paramsWithTypes.push(`${paramName}: ${type.typeName}`);

			paramLines.append("const ");
			paramLines.append(paramName);
			paramLines.append(" = ");
			paramLines.append(
				type.validate(
					`req.${paramType === "path" ? "params" : paramType}.${paramName}`
				)
			);
			paramLines.append(";");

			addJsDoc(
				`@param ${paramName}`,
				paramDescription ||
					`${paramType[0].toUpperCase()}${paramType.substring(1)} param.`
			);
		}

		const { 200: response, ...otherResponses } = responses;
		if (!response) throw `Expected 200 response of operation ${operationId}`;
		if (Object.entries(otherResponses).length) {
			throw `Unexpected responses of operation`;
		}
		if (isReference(response))
			throw `Unexpected reference in response of ${operationId}`;
		const { content: responseContent } = response;
		const returnType = getTypeFromContent(
			imports,
			responseContent,
			true,
			`"${operationId}", "200", "responseBody"`
		);
		if (returnType) {
			addJsDoc("@return", response.description || "Response body.");
		}

		appendMarkdownAsComment(
			abstractMethodLines,
			summary,
			"",
			description,
			"",
			...paramJsDoc
		);
		abstractMethodLines.append("abstract ");
		abstractMethodLines.append(operationId);
		abstractMethodLines.append("(");
		paramsWithTypes.forEach((p, i) => {
			if (i > 0) abstractMethodLines.append(",");
			abstractMethodLines.append(p);
		});
		abstractMethodLines.append("): Promise<");
		abstractMethodLines.append(returnType ? returnType.typeName : "void");
		abstractMethodLines.append(">;\n\n");

		const urlString = new StringBuilder();
		if (typeof url === "string") urlString.append(url);
		else {
			for (const { type, value } of url.parts) {
				if (type === "param") urlString.append(":");
				urlString.append(value);
			}
		}

		// TODO authentication
		registerLines.append("app.");
		registerLines.append(method.toLowerCase());
		registerLines.append("(");
		registerLines.append(JSON.stringify(urlString.toString()));
		registerLines.append(
			", (req: Request, res: Response) => this.handleResponse(res, "
		);
		if (paramNames.length) {
			registerLines.append("(async () => {");
			registerLines.append(paramLines);
			registerLines.append("return await this.");
			registerLines.append(operationId);
			registerLines.append("(");
			registerLines.append(paramNames.join());
			registerLines.append(");})())");
		} else {
			registerLines.append(`this.${operationId}())`);
		}
		registerLines.append(");");

		if (Object.entries(otherOperationProps).length) {
			throw `Unexpected properties of operation ${operationId}: ${JSON.stringify(
				otherOperationProps
			)}`;
		}
	}

	const b = new StringBuilder();
	b.append(imports);
	b.append("\n\n");
	appendMarkdownAsComment(
		b,
		`${tag.display} api.`,
		"",
		...splitLines(tagDescription)
	);
	b.append("export abstract class ");
	b.append(tag.upperCamel);
	b.append("Api extends BaseApi {");
	b.append(abstractMethodLines);
	b.append(
		"/** Register all endpoints. */\nregisterEndpoints(app: Express): void {"
	);
	b.append(registerLines);
	b.append("}}");
	return b.toString();
};

const writeClient = (
	tag: Identifier,
	tagDescription: string | undefined,
	operations: OperationExtended[]
): string => {
	const b = new StringBuilder();
	const imports = new Imports("client");

	b.append(imports);
	appendMarkdownAsComment(
		b,
		`${tag.display} client.`,
		"",
		...splitLines(tagDescription)
	);
	imports.addLocal(undefined, "base-client", "BaseClient");
	b.append("export class ");
	b.append(tag.upperCamel);
	b.append("Client extends BaseClient {");

	for (const {
		summary,
		description,
		method,
		operationId,
		parameters = [],
		requestBody,
		responses,
		security,
		tags,
		url,
		...otherOperationProps
	} of operations) {
		if (!operationId) {
			throw `Expected operation ID for ${method} ${urlToString(url)}`;
		}

		const paramNames: string[] = [];
		const paramsWithTypes: string[] = [];
		const queryParamNames: string[] = [];
		const paramJsDoc: string[] = [];

		const addJsDoc = (prefix: string, doc: string) =>
			paramJsDoc.push(prefix, ...splitLines(doc).map((l) => `  ${l}`));

		if (isReference(requestBody))
			throw `Unexpected reference in request body ${operationId}`;

		let hasBody = false;
		if (requestBody) {
			const requestType = getTypeFromContent(
				imports,
				requestBody?.content,
				requestBody.required || false,
				`"${operationId}", "requestBody"`
			);
			if (requestType) {
				if (!requestBody.required)
					throw `Body is not required for operation ${operationId}`;
				paramNames.push("body");
				paramsWithTypes.push(`body: ${requestType.typeName}`);
				addJsDoc("@param body", requestBody.description || "Request body.");
				hasBody = true;
			}
		}

		for (const parameter of parameters) {
			if (isReference(parameter)) {
				throw `Unexpected reference in parameter of ${operationId}`;
			}
			const {
				name: paramName,
				in: paramType,
				required: paramRequired = false,
				description: paramDescription,
				schema: paramSchema,
			} = parameter;
			if (paramType !== "path" && paramType !== "query") {
				throw `Params should only be path or query: ${paramName} of ${operationId}`;
			}
			if (!paramSchema) {
				throw `Expected schema inside of parameter ${paramName} of ${operationId}`;
			}

			const type = getTypeFromSchema(
				imports,
				paramSchema,
				paramRequired,
				`"${operationId}", "${paramType}", "${paramName}"`
			);
			paramNames.push(paramName);
			if (paramType === "query") {
				queryParamNames.push(paramName);
			}
			paramsWithTypes.push(`${paramName}: ${type.typeName}`);
			addJsDoc(
				`@param ${paramName}`,
				paramDescription ||
					`${paramType[0].toUpperCase()}${paramType.substring(1)} param.`
			);
		}

		addJsDoc(
			"@param overrideConfig",
			"Client config variable overrides. Defaults to the baseConfig."
		);

		const { 200: response, ...otherResponses } = responses;
		if (!response) throw `Expected 200 response of operation ${operationId}`;
		if (Object.entries(otherResponses).length) {
			throw `Unexpected responses of operation`;
		}
		if (isReference(response))
			throw `Unexpected reference in response of ${operationId}`;
		const { content: responseContent } = response;
		const returnType = getTypeFromContent(
			imports,
			responseContent,
			true,
			`"${operationId}", "200", "responseBody"`
		);
		if (returnType) {
			addJsDoc("@return", response.description || "Response body.");
		}

		// TODO add auth header

		appendMarkdownAsComment(b, summary, "", description, "", ...paramJsDoc);
		b.append(operationId);
		b.append("(");
		b.append(paramsWithTypes.join());
		imports.addLocal(undefined, "base-client", "ClientConfig");
		b.append(",overrideConfig: Partial<ClientConfig> = {}): Promise<");
		b.append(returnType ? returnType.typeName : "void");
		b.append('> {return this.fetch(overrideConfig, "');
		b.append(method);
		b.append('",');
		if (!queryParamNames.length && typeof url === "string") {
			b.append(JSON.stringify(url));
			b.append(",");
		} else {
			imports.addLocal(undefined, "base-client", "UrlBuilder");
			b.append("new UrlBuilder()");
			if (typeof url === "string") {
				b.append(".addLiteral(");
				b.append(JSON.stringify(url));
				b.append(")");
			} else {
				for (const { type, value } of url.parts) {
					if (type === "literal") {
						b.append(".addLiteral(");
						b.append(JSON.stringify(value));
						b.append(")");
					} else {
						b.append(".addPathParam(");
						b.append(value);
						b.append(")");
					}
				}
			}
			for (const p of queryParamNames) {
				b.append(".addQuery(");
				b.append(JSON.stringify(p));
				b.append(", ");
				b.append(p);
				b.append(")");
			}
			b.append(".toString(),");
		}
		if (hasBody) {
			b.append("body,");
		}
		if (returnType) {
			b.append("(json: any) => ");
			b.append(returnType.validate("json"));
			b.append(",");
		}
		b.append(");}");

		if (Object.entries(otherOperationProps).length) {
			throw `Unexpected properties of operation ${operationId}: ${JSON.stringify(
				otherOperationProps
			)}`;
		}
	}

	b.append("}");
	return b.toString();
};

import path from "path";
const apiDir = path.resolve(outputDir, mode);
const modelDir = path.resolve(outputDir, "model");

fs.mkdirSync(apiDir);
fs.mkdirSync(modelDir);

import prettier from "prettier";
import { baseApi, baseClient, validate } from "./static";

const isReference = (x: any): x is OpenAPIReference => x && "$ref" in x;

(async () => {
	const prettierConfig = {
		...(await prettier.resolveConfig(outputDir)),
		parser: "typescript",
	};
	const writeFile = (f: string, contents: string) =>
		fs.writeFileSync(
			f,
			prettier.format(
				`/* tslint:disable */\n/* eslint-disable */\n\n${contents}`,
				prettierConfig
			)
		);

	// copy static files
	switch (mode) {
		case "api":
			writeFile(path.resolve(outputDir, "base-api.ts"), baseApi);
			break;
		case "client":
			writeFile(path.resolve(outputDir, "base-client.ts"), baseClient);
			break;
	}
	writeFile(path.resolve(outputDir, "validate.ts"), validate);

	for (const [rawName, schema] of Object.entries(schemas)) {
		const ident = Identifier.fromCamel(rawName);
		if (isReference(schema)) {
			throw `Schema ${ident.upperCamel} was a reference`;
		}
		let contents: string;
		switch (schema.type) {
			case "string":
				contents = writeEnumModel(ident.upperCamel, schema);
				break;
			case "object":
				contents = writeObjectModel(ident.upperCamel, schema);
				break;
			default:
				throw `Unexpected schema type: ${schema.type}`;
		}
		writeFile(path.resolve(modelDir, `${ident.kebab}.ts`), contents);
	}

	const tagIdentifiers: Identifier[] = [];
	for (const [
		tagName,
		{ description, operations, ...otherTagProps },
	] of Object.entries(operationsByTag).sort(([a], [b]) => a.localeCompare(b))) {
		if (Object.entries(otherTagProps).length) {
			throw `Unexpected properties of tag ${tagName}: ${JSON.stringify(
				otherTagProps
			)}`;
		}

		if (!operations.length) throw `Tag ${tagName} had no operations`;

		const tag = Identifier.fromWords(tagName);
		tagIdentifiers.push(tag);

		let contents: string;
		switch (mode) {
			case "api": {
				contents = writeApi(tag, description, operations);
				break;
			}
			case "client": {
				contents = writeClient(tag, description, operations);
				break;
			}
		}
		writeFile(path.resolve(apiDir, `${tag.kebab}.ts`), contents);
	}

	switch (mode) {
		case "api": {
			const b = new StringBuilder();
			b.append('import { Express } from "express";');
			tagIdentifiers.forEach((tag) => {
				b.append("import ");
				b.append(tag.upperCamel);
				b.append('Api from "./api/');
				b.append(tag.kebab);
				b.append('";');
			});
			b.append("\n\nexport type Apis = {");
			tagIdentifiers.forEach((tag) => {
				b.append(tag.lowerCamel);
				b.append(": ");
				b.append(tag.upperCamel);
				b.append("Api;");
			});
			b.append(
				"};\n\nexport const registerApis = (apis: Apis, app: Express): void => {"
			);
			tagIdentifiers.forEach((tag) => {
				b.append("apis.");
				b.append(tag.lowerCamel);
				b.append(".registerEndpoints(app);");
			});
			b.append("};");
			writeFile(path.resolve(outputDir, "register-apis.ts"), b.toString());
			break;
		}

		case "client": {
			const b = new StringBuilder();
			b.append('import { ClientConfig } from "./base-client";');
			tagIdentifiers.forEach((tag) => {
				b.append("import ");
				b.append(tag.upperCamel);
				b.append('Client from "./client/');
				b.append(tag.kebab);
				b.append('";');
			});
			b.append(
				"\n\nexport class Clients {constructor(private readonly baseConfig: ClientConfig) {}"
			);
			tagIdentifiers.forEach((tag) => {
				b.append("public readonly ");
				b.append(tag.lowerCamel);
				b.append(" = new ");
				b.append(tag.upperCamel);
				b.append("Client(this.baseConfig);");
			});
			b.append("}");
			writeFile(path.resolve(outputDir, "clients.ts"), b.toString());
			break;
		}
	}
})();
