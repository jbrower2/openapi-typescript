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
export const isUndefined = (thing: unknown): thing is undefined | null =>
	thing === undefined || thing === null;

/**
 * Validates that something is \`undefined\`, \`null\`, or passes a specific validation.
 *
 * @param thing
 *   The thing to test.
 * @param validate
 *   The validator to use when \`thing\` is not \`undefined\` or \`null\`.
 * @param context
 *   The context to report in error messages.
 * @returns
 *   * \`undefined\` if \`thing\` was \`undefined\` or \`null\`.
 *   * the result of \`validate\` otherwise.
 */
export const validateOpt = <T>(
	thing: unknown,
	validate: (thing: unknown, context: string[]) => T,
	context: string[],
): T | undefined =>
	isUndefined(thing) ? undefined : validate(thing, context);

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
	if (thing === "true") {
		return true;
	}
	if (thing === "false") {
		return false;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be a boolean, but found: \${thing} (\${typeof thing})\`
	);
};

/**
 * Validates that something is \`"Y"\` or \`"N"\`.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   * \`true\` if \`thing\` was \`"Y"\`.
 *   * \`false\` if \`thing\` was \`"N"\`.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not \`"Y"\` or \`"N"\`.
 */
export const validateBooleanYN = (
	thing: unknown,
	context: string[]
): boolean => {
	if (thing === "Y") {
		return true;
	}
	if (thing === "N") {
		return false;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be "Y" or "N", but found: \${thing} (\${typeof thing})\`
	);
};

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

/** Options for validating strings. */
export type ValidateStringOps = {
	/** Minimum string length. */
	minLength?: number;

	/** Maximum string length. */
	maxLength?: number;

	/** Flag to validate proper email format. */
	email?: true;
};

/**
 * Validates that something is a string.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @param options
 *   The string validation options (minLength, maxLength, email).
 * @return
 *   \`thing\` if it was a string.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not a string.
 */
export const validateString = (
	thing: unknown,
	context: string[],
	options: ValidateStringOps = {}
): string => {
	if (typeof thing !== "string") {
		throw new TypeError(
			\`Expected '\${context.join(
				"."
			)}' to be a string, but found: \${thing} (\${typeof thing})\`
		);
	}
	const { minLength, maxLength, email } = options;
	if (
		minLength !== undefined &&
		thing.length < minLength &&
		maxLength !== undefined &&
		thing.length > maxLength
	) {
		const message =
			minLength === undefined
				? \`at most \${maxLength}\`
				: maxLength === undefined
				? \`at least \${minLength}\`
				: minLength === maxLength
				? \`exactly \${minLength}\`
				: \`between \${minLength} and \${maxLength}\`;
		throw new TypeError(
			\`Expected '\${context.join(
				"."
			)}' to be \${message} characters, but found: \${thing}\`
		);
	}
	if (email && !EmailValidator.validate(thing)) {
		throw new TypeError(
			\`Expected '\${context.join(".")}' to be an email, but found: \${thing}\`
		);
	}
	return thing;
};

/**
 * Validates that something is a valid ISO date.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   A \`Date\` at midnight UTC if \`thing\` was a valid ISO date.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not a valid ISO date.
 */
export const validateDate = (thing: unknown, context: string[]): Date => {
	const s = validateString(thing, context, { minLength: 10, maxLength: 10 });
	const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(s);
	if (m) {
		const [, year, month, day] = m;
		return new Date(Date.UTC(
			parseInt(year, 10) - 1970,
			parseInt(month, 10) - 1,
			parseInt(day, 10),
		));
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be a date, but found: \${s}\`
	);
};

/**
 * Validates that something is a valid ISO date-time.
 *
 * @param thing
 *   The thing to test.
 * @param context
 *   The context to report in error messages.
 * @return
 *   A \`Date\` if \`thing\` was a valid ISO date-time.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not a valid ISO date-time.
 */
export const validateDateTime = (thing: unknown, context: string[]): Date => {
	const s = validateString(thing, context, { minLength: 24, maxLength: 24 });
	const m = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})\\.(\\d{3})Z$/.exec(s);
	if (m) {
		const [, year, month, day, hour, minute, second, millisecond] = m;
		return new Date(Date.UTC(
			parseInt(year, 10) - 1970,
			parseInt(month, 10) - 1,
			parseInt(day, 10),
			parseInt(hour, 10),
			parseInt(minute, 10),
			parseInt(second, 10),
			parseInt(millisecond, 10),
		));
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be a date-time, but found: \${s}\`
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
 * Validates that something is a record.
 *
 * @param thing
 *   The thing to test.
 * @param valueMapper
 *   The function to apply to each object value.
 * @param context
 *   The context to report in error messages.
 * @return
 *   \`thing\` if it was a record.
 * @throws {TypeError}
 *   Throws a \`TypeError\` if \`thing\` was not a record.
 */
export const validateRecord = <T>(
	thing: unknown,
	valueMapper: (x: unknown) => T,
	context: string[]
): Record<string, T> => {
	if (thing && typeof thing === "object") {
		const record: Record<string, T> = {};
		for (const [key, value] of Object.entries(thing)) {
			record[key] = valueMapper(value);
		}
		return record;
	}
	throw new TypeError(
		\`Expected '\${context.join(".")}' to be a record, but found: \${thing} (\${typeof thing})\`
	);
};

/**
 * Converts a record to JSON.
 *
 * @param record
 *   The record to convert.
 * @param printValue
 *   The function to convert each object value to JSON.
 * @return
 *   A JSON version of \`record\`.
 */
export const printRecord = <T>(
	record: Record<string, T>,
	printValue: (value: T) => any
): any => {
	const result: any = {};
	for (const [key, value] of Object.entries(record)) {
		result[key] = printValue(value);
	}
	return result;
};

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
