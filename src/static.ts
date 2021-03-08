// #region base api
export const baseApi = `
import { Response } from "express";

/** Exception type that holds a HTTP status and body. */
export class ApiError extends Error {
	/**
	 * Construct this \`ApiError\`.
	 *
	 * @param status
	 *   The HTTP status to send.
	 * @param body
	 *   The HTTP body to send.
	 * @param message
	 *   The exception message.
	 *
	 *   Defaults to the body.
	 */
	constructor(
		public status: number,
		public body: any,
		message: string = JSON.stringify(body)
	) {
		super(message);
	}
}

/** Base class for API controllers. */
export abstract class BaseApi {
	/**
	 * Convenience method for handling API errors.
	 *
	 * @param res
	 *   Express response object.
	 * @param data
	 *   Promise that resolves to the response payload.
	 */
	async handleResponse<T>(res: Response, data: Promise<T>): Promise<void> {
		let body: string;
		try {
			body = JSON.stringify(await data);
		} catch (error) {
			console.error(error);
			if (error instanceof ApiError) {
				res.status(error.status);
				body = JSON.stringify(error.body);
			} else {
				res.status(500);
				body = JSON.stringify(error instanceof Error ? error.message : error);
			}
		}
		if (body) {
			res.set("Content-Type", "application/json").send(body);
		} else {
			res.send();
		}
	}
}
`;
// #endregion

// #region base client
export const baseClient = `
/** Enum of the valid HTTP methods. */
export type HttpMethod =
	| "GET"
	| "PUT"
	| "POST"
	| "DELETE"
	| "OPTIONS"
	| "HEAD"
	| "PATCH"
	| "TRACE";

/** Configuration options for API clients. */
export type ClientConfig = {
	/** The base URL to send requests to. */
	baseUrl: string;

	/** The headers to send in requests. */
	headers?: Record<string, string>;

	/**
	 * The maximum number of milliseconds to wait for a response.
	 *
	 * Set to 0 to wait forever.
	 */
	timeout: number;
};

/** Utility class for building dynamic URLs. */
export class UrlBuilder {
	/**
	 * Base URL.
	 *
	 * Calls to \`addLiteral\` and \`addPathParam\` add to this.
	 */
	private url: string = "";

	/**
	 * Query string.
	 *
	 * Calls to \`addQuery\` add to this.
	 */
	private query: string = "";

	/**
	 * Add a literal value to the URL.
	 *
	 * @param literal
	 *   The literal string to add to the URL.
	 * @return
	 *   This {UrlBuilder} instance.
	 */
	addLiteral(literal: string): this {
		this.url += literal;
		return this;
	}

	/**
	 * Add a path parameter to the URL.
	 *
	 * @param pathParam
	 *   The path param to add to the URL.
	 *
	 *   This value will be URL-encoded.
	 * @return
	 *   This {UrlBuilder} instance.
	 */
	addPathParam(pathParam: string | number | boolean): this {
		this.url += encodeURIComponent(pathParam);
		return this;
	}

	/**
	 * Add a query parameter to the URL, with proper URL encoding.
	 *
	 * @param name
	 *   The name of the query parameter.
	 *
	 *   This value will be URL-encoded.
	 * @param value
	 *   The value of the query parameter.
	 *
	 *   This value will be URL-encoded.
	 * @return
	 *   This {UrlBuilder} instance.
	 */
	addQuery(name: string, value?: string | number | boolean): this {
		this.query += this.query ? "&" : "?";
		this.query += encodeURIComponent(name);
		if (value !== undefined) {
			this.query += "=";
			this.query += encodeURIComponent(value);
		}
		return this;
	}

	/**
	 * Build the URL as a string.
	 *
	 * @return
	 *   The URL as a string.
	 */
	toString(): string {
		return \`\${this.url}\${this.query}\`;
	}
}

/** Helper type to disallow functions. */
export type NotFunction<T> = T extends Function ? never : T;

/** Base class for API clients. */
export abstract class BaseClient {
	/**
	 * Instantiate this client.
	 *
	 * @param baseConfig
	 *   The base {ClientConfig} to use for all requests.
	 */
	constructor(private readonly baseConfig: ClientConfig) {}

	/**
	 * Perform an API request.
	 *
	 * @param overrideConfig
	 *   Overrides of {ClientConfig} options.
	 *
	 *   Any options not specified will default to the client's base config.
	 * @param method
	 *   The HTTP method of the request.
	 * @param url
	 *   The URL of the request.
	 *
	 *   See {UrlBuilder} to build a valid URL.
	 */
	fetch(
		overrideConfig: Partial<ClientConfig>,
		method: HttpMethod,
		url: string
	): Promise<void>;

	/**
	 * Perform an API request, with a request body.
	 *
	 * @param overrideConfig
	 *   Overrides of {ClientConfig} options.
	 *
	 *   Any options not specified will default to the client's base config.
	 * @param method
	 *   The HTTP method of the request.
	 * @param url
	 *   The URL of the request.
	 *
	 *   See {UrlBuilder} to build a valid URL.
	 * @param body
	 *   The body of the request.
	 */
	fetch<I>(
		overrideConfig: Partial<ClientConfig>,
		method: HttpMethod,
		url: string,
		body: NotFunction<I>
	): Promise<void>;

	/**
	 * Perform an API request, with a response handler.
	 *
	 * @param overrideConfig
	 *   Overrides of {ClientConfig} options.
	 *
	 *   Any options not specified will default to the client's base config.
	 * @param method
	 *   The HTTP method of the request.
	 * @param url
	 *   The URL of the request.
	 *
	 *   See {UrlBuilder} to build a valid URL.
	 * @param convertResponse
	 *   The function for validating and converting the JSON response.
	 */
	fetch<O>(
		overrideConfig: Partial<ClientConfig>,
		method: HttpMethod,
		url: string,
		convertResponse: (json: any) => O
	): Promise<O>;

	/**
	 * Perform an API request, with a request body and response handler.
	 *
	 * @param overrideConfig
	 *   Overrides of {ClientConfig} options.
	 *
	 *   Any options not specified will default to the client's base config.
	 * @param method
	 *   The HTTP method of the request.
	 * @param url
	 *   The URL of the request.
	 *
	 *   See {UrlBuilder} to build a valid URL.
	 * @param body
	 *   The body of the request.
	 * @param convertResponse
	 *   The function for validating and converting the JSON response.
	 */
	fetch<I, O>(
		overrideConfig: Partial<ClientConfig>,
		method: HttpMethod,
		url: string,
		body: NotFunction<I>,
		convertResponse: (json: any) => O
	): Promise<O>;

	/**
	 * Perform an API request.
	 *
	 * @param overrideConfig
	 *   Overrides of {ClientConfig} options.
	 *
	 *   Any options not specified will default to the client's base config.
	 * @param method
	 *   The HTTP method of the request.
	 * @param url
	 *   The URL of the request.
	 *
	 *   See {UrlBuilder} to build a valid URL.
	 * @param body
	 *   The body of the request.
	 * @param convertResponse
	 *   The function for validating and converting the JSON response.
	 */
	async fetch<I, O>(
		overrideConfig: Partial<ClientConfig>,
		method: HttpMethod,
		url: string,
		body?: NotFunction<I>,
		convertResponse?: (json: any) => O
	): Promise<O> {
		// coerce empty string to no response
		const bodyString = JSON.stringify(body) || undefined;

		// combine base and override configuration options
		const config: ClientConfig = {
			...this.baseConfig,
			...overrideConfig,
			headers: {
				...(bodyString && { "Content-Type": "application/json" }),
				...(convertResponse && { Accept: "application/json" }),
				...this.baseConfig.headers,
				...overrideConfig.headers,
			},
		};

		const init: RequestInit = {
			body: bodyString,
			headers: config.headers,
			method,
		};

		let abortHandle: NodeJS.Timeout | undefined = undefined;
		if (config.timeout) {
			const abortController = new AbortController();
			init.signal = abortController.signal;
			abortHandle = setTimeout(abortController.abort, config.timeout);
		}
		const response = await fetch(\`\${config.baseUrl}\${url}\`, init);
		if (abortHandle !== undefined) clearTimeout(abortHandle);

		const json = await response.json();
		if (!response.ok) throw json;

		if (convertResponse) return convertResponse(json);
	}
}
`;
// #endregion

// #region validate
export const validate = `
import EmailValidator from "email-validator";

/**
 * Determines if something is \`undefined\` or \`null\`.
 *
 * @param thing
 *   The thing to test.
 * @return
 *   * \`true\` if \`thing\` was \`undefined\` or \`null\`.
 *   * \`false\` otherwise.
 */
export const isUndefined = (thing: unknown): boolean =>
	thing === undefined || thing === null;

/**
 * Validates that something is an object.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   \`true\` if \`thing\` was an object.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not an object.
 */
export const validateObject = (thing: unknown, context: string[]): true => {
	if (typeof thing === "object") {
		return true;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be an object, but found: \${thing} (\${typeof thing})\`
	);
};

/**
 * Helper type to use types as values.
 *
 * @see {@link https://github.com/microsoft/TypeScript/issues/2444#issuecomment-84332319}
 */
export interface Type<T> {
	new (...args: never[]): T;
}

/**
 * Validates that something is a specific type.
 *
 * @param typeRef
 *   The type to test against.
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   \`thing\` if the it was the specified type.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not the specified type.
 */
export const validateType = <T>(
	typeRef: Type<T>,
	thing: unknown,
	context: string[]
): T => {
	if (thing instanceof typeRef) {
		return thing;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be \${typeRef}, but found: \${thing} (\${typeof thing})\`
	);
};

/**
 * Validates that something is a specific type, \`undefined\`, or \`null\`.
 *
 * @param typeRef
 *   The type to test against.
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   * \`thing\` if the it was the specified type.
 *   * \`undefined\` if \`thing\` was \`undefined\` or \`null\`.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not the specified type, \`undefined\`, or \`null\`.
 */
export const validateTypeOpt = <T>(
	typeRef: Type<T>,
	thing: unknown,
	context: string[]
): T | undefined =>
	isUndefined(thing) ? undefined : validateType(typeRef, thing, context);

/**
 * Validates that something is a boolean.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   \`thing\` if it was a boolean.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not a boolean.
 */
export const validateBoolean = (
	thing: unknown,
	context: string[]
): boolean => {
	if (typeof thing === "boolean") {
		return thing;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be a boolean, but found: \${thing} (\${typeof thing})\`
	);
};

/**
 * Validates that something is a boolean, \`undefined\`, or \`null\`.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   * \`thing\` if it was a boolean.
 *   * \`undefined\` if \`thing\` was \`undefined\` or \`null\`.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not a boolean, \`undefined\`, or \`null\`.
 */
export const validateBooleanOpt = (
	thing: unknown,
	context: string[]
): boolean | undefined =>
	isUndefined(thing) ? undefined : validateBoolean(thing, context);

/**
 * Validates that something is a number.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   \`thing\` if it was a number.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not a number.
 */
export const validateNumber = (thing: unknown, context: string[]): number => {
	if (typeof thing === "number") {
		return thing;
	}
	const number = Number(thing);
	if (!Number.isNaN(number)) {
		return number;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be a number, but found: \${thing} (\${typeof thing})\`
	);
};

/**
 * Validates that something is a number, \`undefined\`, or \`null\`.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   * \`thing\` if it was a number.
 *   * \`undefined\` if \`thing\` was \`undefined\` or \`null\`.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not a number, \`undefined\`, or \`null\`.
 */
export const validateNumberOpt = (
	thing: unknown,
	context: string[]
): number | undefined =>
	isUndefined(thing) ? undefined : validateNumber(thing, context);

/**
 * Validates that something is an integer.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   \`thing\` if it was an integer.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not an integer.
 */
export const validateInteger = (thing: unknown, context: string[]): number => {
	const number = validateNumber(thing, context);
	if (Number.isInteger(number)) {
		return number;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be an integer, but found: \${thing} (\${typeof thing})\`
	);
};

/**
 * Validates that something is an integer, \`undefined\`, or \`null\`.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   * \`thing\` if it was an integer.
 *   * \`undefined\` if \`thing\` was \`undefined\` or \`null\`.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not an integer, \`undefined\`, or \`null\`.
 */
export const validateIntegerOpt = (
	thing: unknown,
	context: string[]
): number | undefined =>
	isUndefined(thing) ? undefined : validateInteger(thing, context);

/**
 * Validates that something is a string.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   \`thing\` if it was a string.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not a string.
 */
export const validateString = (thing: unknown, context: string[]): string => {
	if (typeof thing === "string") {
		return thing;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be a string, but found: \${thing} (\${typeof thing})\`
	);
};

/**
 * Validates that something is a string, \`undefined\`, or \`null\`.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   * \`thing\` if it was a string.
 *   * \`undefined\` if \`thing\` was \`undefined\` or \`null\`.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not a string, \`undefined\`, or \`null\`.
 */
export const validateStringOpt = (
	thing: unknown,
	context: string[]
): string | undefined =>
	isUndefined(thing) ? undefined : validateString(thing, context);

/**
 * Validates that a string's length is within a specific range.
 *
 * @param s
 *   The string to test.
 * @param minLength
 *   The minimum string length, or \`undefined\` to skip this validation.
 * @param maxLength
 *   The maximum string length, or \`undefined\` to skip this validation.
 * @param context
 *   The context to report in error messages.
 * @return
 *   \`s\` if its length was in the allowed range.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if the length of \`s\` was not in the allowed range.
 */
export const validateStringLength = (
	s: string,
	minLength: number | undefined,
	maxLength: number | undefined,
	context: string[]
): string => {
	if (
		(minLength === undefined || s.length >= minLength) &&
		(maxLength === undefined || s.length <= maxLength)
	) {
		return s;
	}
	let message: string;
	if (minLength === undefined) {
		message = \`at most \${maxLength}\`;
	} else if (maxLength === undefined) {
		message = \`at least \${minLength}\`;
	} else if (minLength === maxLength) {
		message = \`exactly \${minLength}\`;
	} else {
		message = \`between \${minLength} and \${maxLength}\`;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be \${message} characters, but found: \${s}\`
	);
};

/**
 * Validates that a string is a valid email address.
 *
 * @param s
 *   The string to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   \`s\` if it was a valid email address.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`s\` was not a valid email address.
 */
export const validateEmail = (s: string, context: string[]): string => {
	if (EmailValidator.validate(s)) {
		return s;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be an email, but found: \${s}\`
	);
};

/**
 * Validates that something is an array.
 *
 * @param thing
 *   The thing to test.
 * @param mapper
 *   The function to apply to each array item.
 * @param context
 *   The context to report in error messages.
 * @return
 *   \`thing\` if it was an array.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not an array.
 */
export const validateArray = <T>(
	thing: unknown,
	mapper: (x: unknown) => T,
	context: string[]
): T[] => {
	if (Array.isArray(thing)) {
		return thing.map(mapper);
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be an array, but found: \${thing} (\${typeof thing})\`
	);
};

/**
 * Validates that something is an array, \`undefined\`, or \`null\`.
 *
 * @param thing
 *   The thing to test.
 * @param mapper
 *   The function to apply to each array item.
 * @param context
 *   The context to report in error messages.
 * @return
 *   * \`thing\` if it was an array.
 *   * \`undefined\` if \`thing\` was \`undefined\` or \`null\`.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not an array, \`undefined\`, or \`null\`.
 */
export const validateArrayOpt = <T>(
	thing: unknown,
	mapper: (x: unknown) => T,
	context: string[]
): T[] | undefined =>
	isUndefined(thing) ? undefined : validateArray(thing, mapper, context);

/**
 * Tests whether something is one of a known list of values.
 *
 * @param thing
 *   The thing to test.
 * @param values
 *   The list of known values.
 * @return
 *   * \`true\` if \`thing\` was one of the known values.
 *   * \`false\` otherwise.
 */
export const isOneOf = <E>(thing: unknown, values: readonly E[]): thing is E =>
	values.includes(thing as E);

/**
 * Validates that something is one of a known list of values.
 *
 * @param thing
 *   The thing to test.
 * @param values
 *   The list of known values.
 * @param context
 *   The context to report in error messages.
 * @return
 *   \`thing\` if it was one of the known values.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not one of the known values.
 */
export const validateOneOf = <E>(
	thing: unknown,
	values: readonly E[],
	context: string[]
): E => {
	if (isOneOf(thing, values)) {
		return thing;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be one of [\${values.join(", ")}], but found: \${thing}\`
	);
};
`;
// #endregion
