import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import prettier from "prettier";
import rimraf from "rimraf";
import YAML from "yaml";

import { Identifier } from "./identifier";
import { Imports } from "./imports";
import {
	isReference,
	OpenAPI,
	OpenAPIMediaType,
	OpenAPIOperation,
	OpenAPISchema,
	OpenAPITag,
} from "./openapi";
import { enumTypes, objectTypes, getRuntimeType } from "./runtime-type";
import { baseApi, baseClient, typeUtils } from "./static";
import { StringBuilder } from "./string-builder";

(async () => {
	if (process.argv.length !== 5) {
		console.error(
			"Usage: npx openapi-typescript /path/to/openapi.yaml (api | client) /output/directory"
		);
		process.exit(1);
	}

	const [, , specFile, mode, outputDir] = process.argv;

	if (!fs.existsSync(specFile)) {
		console.error(`Spec file ${specFile} did not exist`);
		process.exit(1);
	}

	if (mode !== "api" && mode !== "client") {
		console.error(`Mode not supported: ${mode}`);
		process.exit(1);
	}

	const specString = await fsp.readFile(specFile, "utf8");

	// calculate hash of the spec
	const { version } = require("../package.json");
	const md5 = crypto.createHash("md5");
	md5.update(`${version}\r\n \t\uFFFF\n${specString}`, "utf8");
	const specHash = md5.digest("base64");

	// check if the hash file matches
	const hashFile = path.join(outputDir, `openapi.hash`);
	if (fs.existsSync(hashFile)) {
		const existingHash = await fsp.readFile(hashFile, "utf8");
		if (existingHash === specHash) {
			console.log("Skipping generation due to matching hashes");
			process.exit();
		}
	}

	// delete output directory
	rimraf.sync(outputDir);

	// wait for directory to be deleted
	const startTime = new Date().getTime();
	while (fs.existsSync(outputDir)) {
		if (new Date().getTime() - startTime > 1000) {
			console.error("Took too long to delete output directory");
			process.exit(1);
		}
	}

	// make output directory
	await fsp.mkdir(outputDir, { recursive: true });

	const { components, paths, tags = [] }: OpenAPI = YAML.parse(specString);
	if (!components) throw "Expected components to be defined!";
	const { schemas, securitySchemes } = components;
	if (!schemas) throw "Expected schemas to be defined!";

	type UrlPart = {
		type: "literal" | "param";
		value: string;
	};

	type Url = { original: string; parts: UrlPart[] };

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
		while ((match = /^(.*?)\{(\w+)\}/.exec(urlRest)) !== null) {
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
		const url: Url = { original: urlString, parts };
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
		b.append("];");
		return b.toString();
	};

	const writeObjectModel = (
		objectName: string,
		objectSchema: OpenAPISchema
	): string => {
		if (!objectSchema.properties) throw `Expected properties in ${objectName}`;
		const b = new StringBuilder();
		const imports = new Imports("model");
		imports.addValidate("testModelObject");
		imports.addValidate("printModelObject");

		const propertyBuilder = new StringBuilder();
		const printBuilder = new StringBuilder();
		const validateBuilder = new StringBuilder();

		for (const [property, propertySchema] of Object.entries(
			objectSchema.properties
		)) {
			const required =
				objectSchema.required !== undefined &&
				objectSchema.required.includes(property);

			const { typeName, fromJson, toJson } = getRuntimeType(
				propertySchema,
				imports,
				`${objectName}.${property}`
			);

			if (!isReference(propertySchema)) {
				appendMarkdownAsComment(
					propertyBuilder,
					...splitLines(propertySchema.description)
				);
			}

			if (!required) imports.addValidate("opt");

			propertyBuilder.append("readonly ");
			propertyBuilder.append(property);
			if (!required) propertyBuilder.append("?");
			propertyBuilder.append(": ");
			propertyBuilder.append(typeName);
			propertyBuilder.append(";");

			printBuilder.append(property);
			printBuilder.append(": ");
			if (!required) printBuilder.append("opt(");
			printBuilder.append(toJson());
			if (!required) printBuilder.append(")");
			printBuilder.append(",");

			validateBuilder.append(property);
			validateBuilder.append(": ");
			if (!required) validateBuilder.append("opt(");
			validateBuilder.append(fromJson());
			if (!required) validateBuilder.append(")");
			validateBuilder.append(",");
		}

		b.append(imports);
		appendMarkdownAsComment(b, ...splitLines(objectSchema.description));
		b.append("export type ");
		b.append(objectName);
		b.append(" = {");
		b.append(propertyBuilder);
		b.append("};\n\n/** Convert from ");
		b.append(objectName);
		b.append(" to JSON. */\nexport const print");
		b.append(objectName);
		b.append(" = printModelObject<");
		b.append(objectName);
		b.append(">(");
		b.append(JSON.stringify(objectName));
		b.append(", {");
		b.append(printBuilder);
		b.append("});\n\n/** Convert from JSON to ");
		b.append(objectName);
		b.append(". */\nexport const test");
		b.append(objectName);
		b.append(" = testModelObject<");
		b.append(objectName);
		b.append(">(");
		b.append(JSON.stringify(objectName));
		b.append(", {");
		b.append(validateBuilder);
		b.append("});");
		return b.toString();
	};

	const getTypeFromContent = (
		content: Record<string, OpenAPIMediaType> | undefined,
		imports: Imports,
		context: string
	) => {
		if (!content) return;
		const { "application/json": jsonContent } = content;
		if (!jsonContent) return;
		const { schema } = jsonContent;
		if (!schema) return;
		return getRuntimeType(schema, imports, context);
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
			operationId: operationId,
			parameters = [],
			requestBody,
			responses,
			security,
			tags,
			url,
			...otherOperationProps
		} of operations) {
			if (!operationId) {
				throw `Expected operation ID for ${method} ${url.original}`;
			}
			const methodName = (() => {
				if (/^\w+$/.test(operationId)) {
					return operationId;
				}
				const m = /^(\w+)\.(\w+)$/.exec(operationId);
				if (m && m[1] === tag.upperCamel) {
					return m[2];
				}
				throw `Expected operation ID for ${method} ${url.original} to start with "${tag.upperCamel}."`;
			})();

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
					requestBody?.content,
					imports,
					`${operationId}.requestBody`
				);
				if (requestType) {
					if (!requestBody.required) {
						throw `Body is not required for operation ${operationId}`;
					}

					const { typeName, fromJson } = requestType;

					paramNames.push("body");
					paramsWithTypes.push(`body: ${typeName}`);

					imports.addValidate("validate");
					paramLines.append("const body = validate(");
					paramLines.append(fromJson());
					paramLines.append(")(req.body, [");
					paramLines.append(JSON.stringify(operationId));
					paramLines.append(', "requestBody"]);');

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

				const { typeName, fromJsonParam } = getRuntimeType(
					paramSchema,
					imports,
					`${operationId}.${paramType}.${paramName}`
				);
				paramNames.push(paramName);
				paramsWithTypes.push(
					`${paramName}: ${typeName}${paramRequired ? "" : " | undefined"}`
				);

				imports.addValidate("validate");
				paramLines.append("const ");
				paramLines.append(paramName);
				paramLines.append(" = validate(");
				if (!paramRequired) {
					imports.addValidate("opt");
					paramLines.append("opt(");
				}
				paramLines.append(fromJsonParam());
				if (!paramRequired) {
					paramLines.append(")");
				}
				paramLines.append(")(req.");
				paramLines.append(paramType === "path" ? "params" : paramType);
				paramLines.append(".");
				paramLines.append(paramName);
				paramLines.append(", [");
				paramLines.append(JSON.stringify(operationId));
				paramLines.append(", ");
				paramLines.append(JSON.stringify(paramType));
				paramLines.append(", ");
				paramLines.append(JSON.stringify(paramName));
				paramLines.append("]);");

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
				responseContent,
				imports,
				`${operationId}.200.responseBody`
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
			abstractMethodLines.append(methodName);
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

			const addResponseValidator = () => {
				if (returnType) {
					imports.addValidate("validate");
					registerLines.append(".then((result) => validate(");
					registerLines.append(returnType.toJson());
					registerLines.append(")(result, [");
					registerLines.append(JSON.stringify(operationId));
					registerLines.append(', "200", "responseBody"]))');
				}
			};

			// TODO authentication
			registerLines.append("app.");
			registerLines.append(method.toLowerCase());
			registerLines.append("(");
			registerLines.append(JSON.stringify(urlString.toString()));
			registerLines.append(", (req: Request, res: Response) => ");
			registerLines.append("this.handleResponse(res, ");
			if (paramNames.length) {
				registerLines.append("(async () => {");
				registerLines.append(paramLines);
				registerLines.append("return await this.");
				registerLines.append(methodName);
				registerLines.append("(");
				registerLines.append(paramNames.join());
				registerLines.append(")");
				addResponseValidator();
				registerLines.append(";})())");
			} else {
				registerLines.append(`this.${methodName}()`);
				addResponseValidator();
				registerLines.append(")");
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
				throw `Expected operation ID for ${method} ${url.original}`;
			}
			const methodName = (() => {
				if (/^\w+$/.test(operationId)) {
					return operationId;
				}
				const m = /^(\w+)\.(\w+)$/.exec(operationId);
				if (m && m[1] === tag.upperCamel) {
					return m[2];
				}
				throw `Expected operation ID for ${method} ${url.original} to start with "${tag.upperCamel}."`;
			})();

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
					requestBody?.content,
					imports,
					`${operationId}.requestBody`
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

				const { typeName } = getRuntimeType(
					paramSchema,
					imports,
					`${operationId}.${paramType}.${paramName}`
				);
				paramNames.push(paramName);
				if (paramType === "query") {
					queryParamNames.push(paramName);
				}
				paramsWithTypes.push(
					`${paramName}: ${typeName}${paramRequired ? "" : " | undefined"}`
				);
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
				responseContent,
				imports,
				`${operationId}.200.responseBody`
			);
			if (returnType) {
				addJsDoc("@return", response.description || "Response body.");
			}

			// TODO add auth header

			appendMarkdownAsComment(b, summary, "", description, "", ...paramJsDoc);
			b.append(methodName);
			b.append("(");
			paramsWithTypes.forEach((p) => {
				b.append(p);
				b.append(",");
			});
			imports.addLocal(undefined, "base-client", "ClientConfig");
			b.append("overrideConfig: Partial<ClientConfig> = {}): Promise<");
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
				if (!hasBody) b.append("undefined,");
				b.append(returnType.fromJson());
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

	const apiDir = path.resolve(outputDir, mode);
	const modelDir = path.resolve(outputDir, "model");

	await fsp.mkdir(apiDir);
	await fsp.mkdir(modelDir);

	const prettierConfig = {
		...(await prettier.resolveConfig(outputDir)),
		parser: "typescript",
	};
	const formatFile = (contents: string) =>
		prettier.format(
			`/* tslint:disable */\n/* eslint-disable */\n\n${contents}`,
			prettierConfig
		);

	// copy static files
	switch (mode) {
		case "api":
			await fsp.writeFile(
				path.resolve(outputDir, "base-api.ts"),
				formatFile(baseApi)
			);
			break;
		case "client":
			await fsp.writeFile(
				path.resolve(outputDir, "base-client.ts"),
				formatFile(baseClient)
			);
			break;
	}
	await fsp.writeFile(
		path.resolve(outputDir, "type-utils.ts"),
		formatFile(typeUtils)
	);

	for (const [rawName, schema] of Object.entries(schemas)) {
		const ident = Identifier.fromCamel(rawName);
		if (isReference(schema)) {
			throw `Schema ${ident.upperCamel} was a reference`;
		}
		switch (schema.type) {
			case "string":
				enumTypes.push(ident.upperCamel);
				break;
			case "object":
				objectTypes.push(ident.upperCamel);
				break;
			default:
				throw `Unexpected schema type: ${schema.type}`;
		}
	}

	for (const [rawName, _schema] of Object.entries(schemas)) {
		const ident = Identifier.fromCamel(rawName);
		const schema = _schema as OpenAPISchema;
		const contents =
			schema.type === "string"
				? writeEnumModel(ident.upperCamel, schema)
				: writeObjectModel(ident.upperCamel, schema);
		await fsp.writeFile(
			path.resolve(modelDir, `${ident.kebab}.ts`),
			formatFile(contents)
		);
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
		await fsp.writeFile(
			path.resolve(apiDir, `${tag.kebab}.ts`),
			formatFile(contents)
		);
	}

	switch (mode) {
		case "api": {
			const b = new StringBuilder();
			b.append('import { Express } from "express";');
			tagIdentifiers.forEach((tag) => {
				b.append("import { ");
				b.append(tag.upperCamel);
				b.append('Api } from "./api/');
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
			await fsp.writeFile(
				path.resolve(outputDir, "register-apis.ts"),
				formatFile(b.toString())
			);
			break;
		}

		case "client": {
			const b = new StringBuilder();
			b.append('import { ClientConfig } from "./base-client";');
			tagIdentifiers.forEach((tag) => {
				b.append("import { ");
				b.append(tag.upperCamel);
				b.append('Client } from "./client/');
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
			await fsp.writeFile(
				path.resolve(outputDir, "clients.ts"),
				formatFile(b.toString())
			);
			break;
		}
	}

	// last thing to do is write the hash to the hash file
	await fsp.writeFile(hashFile, specHash);
})();
