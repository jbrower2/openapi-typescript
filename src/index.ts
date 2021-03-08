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
		const tag = operationsByTag[tagName];
		if (!tag) throw `Could not find tag ${tagName}`;
		tag.operations.push({ ...operation, url, method });
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

	getLines(lines: string[]) {
		const importLines = [];
		for (const [file, { named: namedSet }] of Object.entries(
			this.imports
		).sort(([a], [b]) => a.localeCompare(b))) {
			const named = Array.from(namedSet).sort((a, b) => a.localeCompare(b));
			importLines.push(`import { ${named.join(", ")} } from "${file}";`);
		}
		return importLines.length ? [...importLines, "", ...lines] : lines;
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

const indent = (s: string, n: number) =>
	s.replace(/\n/g, `\n${"\t".repeat(n)}`);

const getComponentFromRef = (ref: string) => {
	const match = /^#\/components\/schemas\/(\w+)$/.exec(ref);
	if (!match)
		throw `Expected ref to be of form /^#\\/components\\/schemas\\/(\\w+)$/, but found: ${ref}`;
	return Identifier.fromCamel(match[1]);
};

const splitLines = (s: string | undefined) =>
	s ? s.trim().split(/\r?\n/) : [];

const markdownToCommentLines = (...lines: (string | undefined)[]) => {
	// remove empty elements from the end
	while (lines.length && !lines[lines.length - 1]) lines.pop();

	// remove empty elements from the beginning
	while (lines.length && !lines[0]) lines.shift();

	if (!lines.length) return [];
	if (lines.length === 1) return [`/** ${lines[0]} */`];
	return ["/**", ...lines.map((x) => (x ? ` * ${x.trimEnd()}` : " *")), " */"];
};

const writeEnumModel = (
	enumName: string,
	{ description, enum: enumValues }: OpenAPISchema
) => {
	if (!enumValues) throw `Expected enum values in ${enumName}`;
	const lines = [];
	lines.push('import { validateOneOf } from "../validate";');
	lines.push("");
	lines.push(...markdownToCommentLines(...splitLines(description)));
	lines.push(`export type ${enumName} =`);
	enumValues.forEach((enumValue, i) => {
		let line = `\t| '${enumValue}'`;
		if (i === enumValues.length - 1) line += ";";
		lines.push(line);
	});
	lines.push("");
	lines.push(`/** Array of ${enumName} values. */`);
	lines.push(`export const values${enumName}: readonly ${enumName}[] = [`);
	enumValues.forEach((enumValue) => lines.push(`\t"${enumValue}",`));
	lines.push("];");
	lines.push("");
	lines.push(`/** Convert from ${enumName} to JSON. */`);
	lines.push(
		`export const print${enumName} = (value: ${enumName}): any => value;`
	);
	lines.push("");
	lines.push(`/** Convert from JSON to ${enumName}. */`);
	lines.push(
		`export const validate${enumName} = (json: any, context: string[] = ["${enumName}"]): ${enumName} =>`
	);
	lines.push(`\tvalidateOneOf(json, values${enumName}, context);`);
	return lines;
};

const writeObjectModel = (objectName: string, objectSchema: OpenAPISchema) => {
	if (!objectSchema.properties) throw `Expected properties in ${objectName}`;
	const imports = new Imports("model");

	const propertyLines = [];
	const printLines = [];
	const validateLines = [];

	for (const [property, propertySchema] of Object.entries(
		objectSchema.properties
	)) {
		propertyLines.push("");

		const required =
			objectSchema.required !== undefined &&
			objectSchema.required.includes(property);

		let propertyLine: string;
		let printLine: string;
		let validateLine: string;

		if (isReference(propertySchema)) {
			const ref = propertySchema.$ref;
			if (!ref)
				throw `Expected untyped property to have $ref: ${objectName}.${property}`;
			const name = getComponentFromRef(ref);
			imports.addLocal("model", name.kebab, name.upperCamel);
			imports.addLocal("model", name.kebab, `print${name.upperCamel}`);
			imports.addLocal("model", name.kebab, `validate${name.upperCamel}`);

			propertyLine = name.upperCamel;
			printLine = `print${name.upperCamel}(value.${property})`;
			validateLine = `validate${name.upperCamel}(json.${property}, [...context, "${property}"])`;
		} else {
			propertyLines.push(
				...markdownToCommentLines(
					...splitLines(propertySchema.description)
				).map((l) => `\t${l}`)
			);

			propertyLine = propertySchema.type || "";
			printLine = `value.${property}`;

			switch (propertySchema.type) {
				case "array": {
					if (!propertySchema.items)
						throw `Expected items within ${objectName}.${property}`;
					const itemSchema = propertySchema.items;
					if (isReference(itemSchema)) {
						throw `Array items schema was a reference ${objectName}.${property}`;
					}

					propertyLine = `${itemSchema.type}[]`;

					switch (itemSchema.type) {
						case "string": {
							imports.addValidate("validateString");
							validateLine = `validateString(x, [...context, "${property}"])`;

							break;
						}

						default:
							throw `Unexpected item type: ${itemSchema.type} (${objectName}.${property}.items)`;
					}

					const validateMethod = required
						? "validateArray"
						: "validateArrayOpt";
					imports.addValidate(validateMethod);
					validateLine = `${validateMethod}(\n\tjson.${property},\n\t(x) => ${validateLine},\n\t[...context, "${property}"],\n)`;

					break;
				}

				case "boolean": {
					const validateMethod = required
						? "validateBoolean"
						: "validateBooleanOpt";
					imports.addValidate(validateMethod);
					validateLine = `${validateMethod}(json.${property}, [...context, "${property}"])`;

					break;
				}

				case "integer": {
					propertyLine = "number";

					const validateMethod = required
						? "validateInteger"
						: "validateIntegerOpt";
					imports.addValidate(validateMethod);
					validateLine = `${validateMethod}(json.${property}, [...context, "${property}"])`;

					break;
				}

				case "string": {
					const format = propertySchema.format;
					const minLength = propertySchema.minLength;
					const maxLength = propertySchema.maxLength;

					if (
						format === undefined &&
						minLength === undefined &&
						maxLength === undefined
					) {
						const validateMethod = required
							? "validateString"
							: "validateStringOpt";
						imports.addValidate(validateMethod);
						validateLine = `${validateMethod}(json.${property}, [...context, "${property}"])`;
					} else {
						imports.addValidate("validateString");
						validateLine = `validateString(json.${property}, [...context, "${property}"])`;
						switch (format) {
							case undefined:
								break;
							case "email":
								imports.addValidate("validateEmail");
								validateLine = `validateEmail(\n\t${indent(
									validateLine,
									1
								)},\n\t[...context, "${property}"],\n)`;
								break;
							default:
								throw `Unexpected format for ${objectName}.${property}: ${format}`;
						}
						if (minLength !== undefined || maxLength !== undefined) {
							imports.addValidate("validateStringLength");
							validateLine = `validateStringLength(\n\t${indent(
								validateLine,
								1
							)},\n\t${minLength},\n\t${maxLength},\n\t[...context, "${property}"],\n)`;
						}
						if (!required) {
							imports.addValidate("isUndefined");
							validateLine = `isUndefined(json.${property}) ? undefined : ${validateLine}`;
						}
					}

					break;
				}

				default:
					throw `Unexpected property type: ${propertySchema.type} (${objectName}.${property})`;
			}
		}

		propertyLines.push(
			`\treadonly ${property}${required ? "" : "?"}: ${propertyLine};`
		);

		printLines.push(`\t${property}: ${indent(printLine, 1)},`);

		validateLines.push(`\t\t${property}: ${indent(validateLine, 2)},`);
	}

	// remove first empty string
	propertyLines.shift();

	const lines: string[] = [];
	lines.push(
		...markdownToCommentLines(...splitLines(objectSchema.description))
	);
	lines.push(`export type ${objectName} = {`);
	lines.push(...propertyLines);
	lines.push("};");
	lines.push("");
	lines.push(`/** Convert from ${objectName} to JSON. */`);
	lines.push(
		`export const print${objectName} = (value: ${objectName}): any => ({`
	);
	lines.push(...printLines);
	lines.push("});");
	lines.push("");
	lines.push(`/** Convert from JSON to ${objectName}. */`);
	lines.push(
		`export const validate${objectName} = (json: any, context: string[] = ["${objectName}"]): ${objectName} =>`
	);
	imports.addValidate("validateObject");
	lines.push(`\tvalidateObject(json, context) && ({`);
	lines.push(...validateLines);
	lines.push("\t});");
	return imports.getLines(lines);
};

const writeFile = (lines: string[]) => {
	return [
		"/* tslint:disable */",
		"/* eslint-disable */",
		"",
		...lines.map((s) => s.trimEnd()),
		"",
	].join("\n");
};

type RuntimeType = {
	typeName: string;
	validate: (name: string) => string;
};

const getTypeFromSchema = (
	imports: Imports,
	schema: OpenAPISchema | OpenAPIReference,
	required: boolean,
	context: string[]
): RuntimeType => {
	if (isReference(schema)) {
		const ident = getComponentFromRef(schema.$ref);
		imports.addLocal("model", ident.kebab, ident.upperCamel);
		return {
			typeName: required ? ident.upperCamel : `${ident.upperCamel} | undefined`,
			validate: (name) => {
				const validateMethod = `validate${ident.upperCamel}`;
				imports.addLocal("model", ident.kebab, validateMethod);
				if (required)
					return `${validateMethod}(${name}, [${context
						.map((x) => `"${x}"`)
						.join(", ")}])`;
				imports.addValidate("isUndefined");
				return `isUndefined(${name}) ? undefined : ${validateMethod}(${name}, [${context
					.map((x) => `"${x}"`)
					.join(", ")}])`;
			},
		};
	}

	const { type, items } = schema;
	switch (type) {
		case "array": {
			if (!items) {
				throw `Expected 'items' inside '${context.join(".")}'`;
			}
			const { typeName, validate } = getTypeFromSchema(imports, items, true, [
				...context,
				"items",
			]);
			return {
				typeName: required ? `${typeName}[]` : `${typeName}[] | undefined`,
				validate: (name) => {
					const inner = validate("x");
					let validateMethod = "validateArray";
					if (!required) validateMethod += "Opt";
					imports.addValidate(validateMethod);
					return `${validateMethod}(\n\t${name},\n\t(x) => ${inner},\n\t[${context
						.map((x) => `"${x}"`)
						.join(", ")}],\n)`;
				},
			};
		}

		case "boolean":
		case "number":
		case "string":
			return {
				typeName: required ? type : `${type} | undefined`,
				validate: (name) => {
					let validateMethod = "validate";
					validateMethod += type[0].toUpperCase();
					validateMethod += type.substring(1);
					if (!required) validateMethod += "Opt";
					imports.addValidate(validateMethod);
					return `${validateMethod}(${name}, [${context
						.map((x) => `"${x}"`)
						.join(", ")}])`;
				},
			};

		case "integer":
			return {
				typeName: required ? "number" : "number | undefined",
				validate: (name) => {
					let validateMethod = "validateInteger";
					if (!required) validateMethod += "Opt";
					imports.addValidate(validateMethod);
					return `${validateMethod}(${name}, [${context
						.map((x) => `"${x}"`)
						.join(", ")}])`;
				},
			};

		default:
			throw `Unexpected type '${type}' of '${context}'`;
	}
};

const getTypeFromContent = (
	imports: Imports,
	content: { [key: string]: OpenAPIMediaType },
	required: boolean,
	context: string[]
) => {
	if (!content) return;
	const { "application/json": jsonContent } = content;
	const { schema } = jsonContent;
	if (!schema) return;
	return getTypeFromSchema(imports, schema, required, context);
};

const writeApi = (
	tag: Identifier,
	tagDescription: string | undefined,
	operations: OperationExtended[]
) => {
	const imports = new Imports("api");

	const abstractMethodLines = [];
	const registerLines = [];

	for (const {
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
		const paramNames: string[] = [];
		const paramsWithTypes: string[] = [];
		const paramLines: string[] = [];
		const paramJsDoc: string[] = [];

		const addJsDoc = (prefix: string, doc: string) =>
			paramJsDoc.push(prefix, ...splitLines(doc).map((l) => `  ${l}`));

		if (isReference(requestBody))
			throw `Unexpected reference in request body ${method} ${urlToString(
				url
			)}`;

		if (requestBody) {
			const requestType = getTypeFromContent(
				imports,
				requestBody?.content,
				requestBody.required || false,
				[urlToString(url), method, "requestBody"]
			);
			if (requestType) {
				if (!requestBody.required)
					throw `Body is not required for operation ${method} ${urlToString(
						url
					)}`;
				paramNames.push("body");
				paramsWithTypes.push(`body: ${requestType.typeName}`);
				paramLines.push(`const body = ${requestType.validate("req.body")};`);
				addJsDoc("@param body", requestBody.description || "Request body.");
			}
		}

		for (const parameter of parameters) {
			if (isReference(parameter)) {
				throw `Unexpected reference in parameter of ${method} ${urlToString(
					url
				)}`;
			}
			const {
				name: paramName,
				in: paramType,
				required: paramRequired = false,
				description: paramDescription,
				schema: paramSchema,
			} = parameter;
			if (!paramSchema) {
				throw `Expected schema inside of parameter ${paramName} of ${method} ${urlToString(
					url
				)}`;
			}

			const type = getTypeFromSchema(imports, paramSchema, paramRequired, [
				urlToString(url),
				method,
				paramType,
				paramName,
			]);
			paramNames.push(paramName);
			paramsWithTypes.push(`${paramName}: ${type.typeName}`);
			paramLines.push(
				`const ${paramName} = ${type.validate(
					`req.${paramType === "path" ? "params" : paramType}.${paramName}`
				)};`
			);
			addJsDoc(
				`@param ${paramName}`,
				paramDescription ||
					`${paramType[0].toUpperCase()}${paramType.substring(1)} param.`
			);
		}

		const { 200: response, ...otherResponses } = responses;
		if (!response)
			throw `Expected 200 response of operation ${method} ${urlToString(url)}`;
		if (Object.entries(otherResponses).length) {
			throw `Unexpected responses of operation`;
		}
		if (isReference(response))
			throw `Unexpected reference in response of ${method} ${urlToString(url)}`;
		const { content: responseContent } = response;
		if (!responseContent)
			throw `Expected content for response of ${method} ${urlToString(url)}`;
		const returnType = getTypeFromContent(imports, responseContent, true, [
			urlToString(url),
			method,
			"200",
			`responseBody`,
		]);
		if (returnType) {
			addJsDoc("@return", response.description || "Response body.");
		}

		abstractMethodLines.push(
			...markdownToCommentLines(description, "", ...paramJsDoc).map(
				(x) => `\t${x}`
			)
		);
		if (paramsWithTypes.length) {
			abstractMethodLines.push(`\tabstract ${operationId}(`);
			paramsWithTypes.forEach((p) => abstractMethodLines.push(`\t\t${p},`));
			abstractMethodLines.push(
				`\t): Promise<${returnType ? returnType.typeName : "void"}>;`
			);
		} else {
			abstractMethodLines.push(
				`\tabstract ${operationId}(): Promise<${
					returnType ? returnType.typeName : "void"
				}>;`
			);
		}
		abstractMethodLines.push("");

		let urlString: string;
		if (typeof url === "string") urlString = url;
		else {
			urlString = "";
			for (const { type, value } of url.parts) {
				if (type === "param") urlString += ":";
				urlString += value;
			}
		}
		urlString = JSON.stringify(urlString);

		// TODO authentication
		imports.addGlobal("express", "Request");
		imports.addGlobal("express", "Response");
		registerLines.push(
			`\t\tapp.${method.toLowerCase()}(${urlString}, (req: Request, res: Response) =>`
		);
		if (paramNames.length) {
			registerLines.push("\t\t\tthis.handleResponse(res, (async () => {");
			registerLines.push(...paramLines.map((l) => `\t\t\t\t${l}`));
			registerLines.push(
				`\t\t\t\treturn await this.${operationId}(${paramNames.join(", ")});`
			);
			registerLines.push("\t\t\t})())");
		} else {
			registerLines.push(
				`\t\t\tthis.handleResponse(res, this.${operationId}())`
			);
		}
		registerLines.push("\t\t);");
		registerLines.push("");

		if (Object.entries(otherOperationProps).length) {
			throw `Unexpected properties of operation ${method} ${urlToString(
				url
			)}: ${JSON.stringify(otherOperationProps)}`;
		}
	}

	// remove last empty line
	registerLines.pop();

	const lines = [];
	lines.push(
		...markdownToCommentLines(
			`${tag.display} api.`,
			"",
			...splitLines(tagDescription)
		)
	);
	imports.addLocal(undefined, "base-api", "BaseApi");
	lines.push(
		`export default abstract class ${tag.upperCamel}Api extends BaseApi {`
	);
	lines.push(...abstractMethodLines);
	lines.push("\t/** Register all endpoints. */");
	imports.addGlobal("express", "Express");
	lines.push("\tregisterEndpoints(app: Express): void {");
	lines.push(...registerLines);
	lines.push("\t}");
	lines.push("}");
	return imports.getLines(lines);
};

const writeClient = (
	tag: Identifier,
	tagDescription: string | undefined,
	operations: OperationExtended[]
) => {
	const imports = new Imports("client");

	const lines = [];
	lines.push(
		...markdownToCommentLines(
			`${tag.display} client.`,
			"",
			...splitLines(tagDescription)
		)
	);
	imports.addLocal(undefined, "base-client", "BaseClient");
	lines.push(
		`export default class ${tag.upperCamel}Client extends BaseClient {`
	);

	for (const {
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
		const paramNames: string[] = [];
		const paramsWithTypes: string[] = [];
		const queryParamNames: string[] = [];
		const paramJsDoc: string[] = [];

		const addJsDoc = (prefix: string, doc: string) =>
			paramJsDoc.push(prefix, ...splitLines(doc).map((l) => `  ${l}`));

		if (isReference(requestBody))
			throw `Unexpected reference in request body ${method} ${urlToString(
				url
			)}`;

		let hasBody = false;
		if (requestBody) {
			const requestType = getTypeFromContent(
				imports,
				requestBody?.content,
				requestBody.required || false,
				[urlToString(url), method, "requestBody"]
			);
			if (requestType) {
				if (!requestBody.required)
					throw `Body is not required for operation ${method} ${urlToString(
						url
					)}`;
				paramNames.push("body");
				paramsWithTypes.push(`body: ${requestType.typeName}`);
				addJsDoc("@param body", requestBody.description || "Request body.");
				hasBody = true;
			}
		}

		for (const parameter of parameters) {
			if (isReference(parameter)) {
				throw `Unexpected reference in parameter of ${method} ${urlToString(
					url
				)}`;
			}
			const {
				name: paramName,
				in: paramType,
				required: paramRequired = false,
				description: paramDescription,
				schema: paramSchema,
			} = parameter;
			if (paramType !== "path" && paramType !== "query") {
				throw `Params should only be path or query: ${paramName} of ${method} ${urlToString(
					url
				)}`;
			}
			if (!paramSchema) {
				throw `Expected schema inside of parameter ${paramName} of ${method} ${urlToString(
					url
				)}`;
			}

			const type = getTypeFromSchema(imports, paramSchema, paramRequired, [
				urlToString(url),
				method,
				paramType,
				paramName,
			]);
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
		if (!response)
			throw `Expected 200 response of operation ${method} ${urlToString(url)}`;
		if (Object.entries(otherResponses).length) {
			throw `Unexpected responses of operation`;
		}
		if (isReference(response))
			throw `Unexpected reference in response of ${method} ${urlToString(url)}`;
		const { content: responseContent } = response;
		if (!responseContent)
			throw `Expected content for response of ${method} ${urlToString(url)}`;
		const returnType = getTypeFromContent(imports, responseContent, true, [
			urlToString(url),
			method,
			"200",
			`responseBody`,
		]);
		if (returnType) {
			addJsDoc("@return", response.description || "Response body.");
		}

		// TODO add auth header

		lines.push(
			...markdownToCommentLines(description, "", ...paramJsDoc).map(
				(x) => `\t${x}`
			)
		);
		lines.push(`\t${operationId}(`);
		paramsWithTypes.forEach((p) => lines.push(`\t\t${p},`));
		imports.addLocal(undefined, "base-client", "ClientConfig");
		lines.push("\t\toverrideConfig: Partial<ClientConfig> = {}");
		lines.push(`\t): Promise<${returnType ? returnType.typeName : "void"}> {`);
		lines.push("\t\treturn this.fetch(");
		lines.push("\t\t\toverrideConfig,");
		lines.push(`\t\t\t"${method}",`);
		if (!queryParamNames.length && typeof url === "string") {
			lines.push(`\t\t\t${JSON.stringify(url)},`);
		} else {
			imports.addLocal(undefined, "base-client", "UrlBuilder");
			lines.push("\t\t\tnew UrlBuilder()");
			if (typeof url === "string") {
				lines.push(`\t\t\t\t.addLiteral(${JSON.stringify(url)})`);
			} else {
				for (const { type, value } of url.parts) {
					if (type === "literal") {
						lines.push(`\t\t\t\t.addLiteral(${JSON.stringify(value)})`);
					} else {
						lines.push(`\t\t\t\t.addPathParam(${value})`);
					}
				}
			}
			for (const p of queryParamNames) {
				lines.push(`\t\t\t\t.addQuery(${JSON.stringify(p)}, ${p})`);
			}
			lines.push("\t\t\t\t.toString(),");
		}
		if (hasBody) {
			lines.push("\t\t\tbody,");
		}
		if (returnType) {
			lines.push(
				`\t\t\t(json: any) => ${indent(returnType.validate("json"), 3)},`
			);
		}
		lines.push("\t\t);");
		lines.push("\t}");
		lines.push("");

		if (Object.entries(otherOperationProps).length) {
			throw `Unexpected properties of operation ${method} ${urlToString(
				url
			)}: ${JSON.stringify(otherOperationProps)}`;
		}
	}

	// remove last blank line
	lines.pop();

	lines.push("}");
	return imports.getLines(lines);
};

import path from "path";
const apiDir = path.resolve(outputDir, mode);
const modelDir = path.resolve(outputDir, "model");

fs.mkdirSync(apiDir);
fs.mkdirSync(modelDir);

// copy static files
import { baseApi, baseClient, validate } from "./static";
switch (mode) {
	case "api":
		fs.writeFileSync(
			path.resolve(outputDir, "base-api.ts"),
			writeFile(splitLines(baseApi.trim()))
		);
		break;
	case "client":
		fs.writeFileSync(
			path.resolve(outputDir, "base-client.ts"),
			writeFile(splitLines(baseClient.trim()))
		);
		break;
}
fs.writeFileSync(
	path.resolve(outputDir, "validate.ts"),
	writeFile(splitLines(validate.trim()))
);

const isReference = (x: any): x is OpenAPIReference => x && "$ref" in x;

for (const [rawName, schema] of Object.entries(schemas)) {
	const ident = Identifier.fromCamel(rawName);
	if (isReference(schema)) throw `Schema ${ident.upperCamel} was a reference`;
	let contents;
	switch (schema.type) {
		case "string":
			contents = writeFile(writeEnumModel(ident.upperCamel, schema));
			break;
		case "object":
			contents = writeFile(writeObjectModel(ident.upperCamel, schema));
			break;
		default:
			throw `Unexpected schema type: ${schema.type}`;
	}
	fs.writeFileSync(path.resolve(modelDir, `${ident.kebab}.ts`), contents);
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

	let contents: string[];
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
	fs.writeFileSync(
		path.resolve(apiDir, `${tag.kebab}.ts`),
		writeFile(contents)
	);
}

switch (mode) {
	case "api":
		fs.writeFileSync(
			path.resolve(outputDir, "register-apis.ts"),
			writeFile([
				'import { Express } from "express";',
				...tagIdentifiers.map(
					(tag) => `import ${tag.lowerCamel}Api from "@app/api/${tag.kebab}";`
				),
				"",
				"export default (app: Express): void => {",
				...tagIdentifiers.map(
					(tag) => `\t${tag.lowerCamel}Api.registerEndpoints(app);`
				),
				"}",
			])
		);
		break;

	case "client":
		fs.writeFileSync(
			path.resolve(outputDir, "clients.ts"),
			writeFile([
				'import { ClientConfig } from "./base-client";',
				...tagIdentifiers.map(
					(tag) =>
						`import ${tag.upperCamel}Client from "./client/${tag.kebab}";`
				),
				"",
				"export default class Clients {",
				"\tconstructor(private readonly baseConfig: ClientConfig) {}",
				"",
				...tagIdentifiers.map(
					(tag) =>
						`\tpublic readonly ${tag.lowerCamel} = new ${tag.upperCamel}Client(this.baseConfig);`
				),
				"}",
			])
		);
		break;
}
