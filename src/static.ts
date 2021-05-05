// #region base api
export const baseApi = `
import { Response } from "express";
import JSONbig from 'json-bigint';

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
		message: string = JSONbig.stringify(body)
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
			body = JSONbig.stringify(await data);
		} catch (error) {
			console.error(error);
			if (error instanceof ApiError) {
				res.status(error.status);
				body = JSONbig.stringify(error.body);
			} else {
				res.status(500);
				body = JSONbig.stringify(error instanceof Error ? error.message : error);
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
import JSONbig from 'json-bigint';

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
		const bodyString = JSONbig.stringify(body) || undefined;

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

// #region typeUtils
export const typeUtils = `
import BigNumber from "bignumber.js";
import EmailValidator from "email-validator";
import { DateTime } from "luxon";

/** Type representing a successful type validation. */
export type TypeTestSuccess<T> = { success: true; value: T };

/** Type representing a failed type validation. */
export type TypeTestFailure = { success: false; message?: string };

/** Combined type for success and failure results. */
export type TypeTestResult<T> = TypeTestSuccess<T> | TypeTestFailure;

/** Type guard for successful results. */
export function isSuccess<T>(
	result: TypeTestResult<T>
): result is TypeTestSuccess<T> {
	return result.success;
}

/** Construct a successful result object. */
export function success<T>(value: T): TypeTestSuccess<T> {
	return { success: true, value };
}

/** Construct a failed result object. */
export function failure(message?: string): TypeTestFailure {
	return { success: false, message };
}

/**
 * Tests whether something matches certain criteria.
 *
 * @param thing The thing to test.
 * @param context The context to report error messages in.
 * @return An object containing either the successful conversion, or an error message explaining the failure reason.
 */
export type TypeTest<T, INPUT> = (
	thing: INPUT,
	context: string[]
) => TypeTestResult<T>;

/**
 * Validates that something matches certain criteria.
 *
 * @param thing The thing to test.
 * @param context The context to report error messages in.
 * @return The converted object, if successful.
 * @throws A \`TypeError\` if conversion failed.
 */
export type TypeValidator<T, INPUT = unknown> = (
	thing: INPUT,
	context: string[]
) => T;

/**
 * Turns a \`TypeTest\` into a \`TypeValidator\`.
 *
 * @param test The \`TypeTest\` to validate agains.
 * @returns The \`TypeValidator\` that wraps the given \`TypeTest\`.
 */
export function validate<T, INPUT>(
	test: TypeTest<T, INPUT>
): TypeValidator<T, INPUT> {
	return (thing, context) => {
		const result = test(thing, context);
		if (isSuccess(result)) {
			return result.value;
		}
		throw new TypeError(result.message);
	};
}

/**
 * Determines if something is \`undefined\` or \`null\`.
 *
 * @param thing The thing to test.
 * @return \`true\` if \`thing\` was \`undefined\` or \`null\`, \`false\` otherwise.
 */
export function isUndefined(thing: unknown): thing is undefined | null {
	return thing === undefined || thing === null;
}

/**
 * Add context to a \`TypeTest\`.
 *
 * @param test The test to add context to.
 * @param additionalContext The context to add.
 * @returns The wrapped \`TypeTest\`.
 */
export function addContext<T, INPUT>(
	test: TypeTest<T, INPUT>,
	...additionalContext: string[]
): TypeTest<T, INPUT> {
	return (thing, context) => test(thing, [...context, ...additionalContext]);
}

/**
 * Combines two \`TypeTest\` instances as a logical conjunction (AND).
 *
 * @param test1 The first \`TypeTest\`.
 * @param test2 The second \`TypeTest\`.
 * @returns The combined \`TypeTest\`.
 */
export function and<T1, T2, INPUT>(
	test1: TypeTest<T1, INPUT>,
	test2: TypeTest<T2, T1>
): TypeTest<T2, INPUT>;

/**
 * Combines three \`TypeTest\` instances as a logical conjunction (AND).
 *
 * @param test1 The first \`TypeTest\`.
 * @param test2 The second \`TypeTest\`.
 * @param test3 The third \`TypeTest\`.
 * @returns The combined \`TypeTest\`.
 */
export function and<T1, T2, T3, INPUT>(
	test1: TypeTest<T1, INPUT>,
	test2: TypeTest<T2, T1>,
	test3: TypeTest<T3, T2>
): TypeTest<T3, INPUT>;

/**
 * Combines four \`TypeTest\` instances as a logical conjunction (AND).
 *
 * @param test1 The first \`TypeTest\`.
 * @param test2 The second \`TypeTest\`.
 * @param test3 The third \`TypeTest\`.
 * @param test4 The fourth \`TypeTest\`.
 * @returns The combined \`TypeTest\`.
 */
export function and<T1, T2, T3, T4, INPUT>(
	test1: TypeTest<T1, INPUT>,
	test2: TypeTest<T2, T1>,
	test3: TypeTest<T3, T2>,
	test4: TypeTest<T4, T3>
): TypeTest<T4, INPUT>;

/**
 * Combines five \`TypeTest\` instances as a logical conjunction (AND).
 *
 * @param test1 The first \`TypeTest\`.
 * @param test2 The second \`TypeTest\`.
 * @param test3 The third \`TypeTest\`.
 * @param test4 The fourth \`TypeTest\`.
 * @param test5 The fifth \`TypeTest\`.
 * @returns The combined \`TypeTest\`.
 */
export function and<T1, T2, T3, T4, T5, INPUT>(
	test1: TypeTest<T1, INPUT>,
	test2: TypeTest<T2, T1>,
	test3: TypeTest<T3, T2>,
	test4: TypeTest<T4, T3>,
	test5: TypeTest<T5, T4>
): TypeTest<T5, INPUT>;

/**
 * Combines multiple \`TypeTest\` instances as a logical conjunction (AND).
 *
 * @deprecated This method should not be used directly.
 * @returns The combined \`TypeTest\`.
 */
export function and<T, INPUT>(): TypeTest<T, INPUT> {
	const tests = Array.from(arguments) as readonly TypeTest<T, INPUT>[];
	return (thing, context) => {
		let cur: unknown = thing;
		for (const test of tests) {
			const result = test(cur as INPUT, context);
			if (!isSuccess(result)) return result;
			cur = result.value as unknown;
		}
		return success(cur as T);
	};
}

/**
 * Combines two \`TypeTest\` instances as a logical disjunction (OR).
 *
 * @param test1 The first \`TypeTest\`.
 * @param test2 The second \`TypeTest\`.
 * @returns The combined \`TypeTest\`.
 */
export function or<T1, T2, INPUT>(
	test1: TypeTest<T1, INPUT>,
	test2: TypeTest<T2, INPUT>
): TypeTest<T1 | T2, INPUT>;

/**
 * Combines three \`TypeTest\` instances as a logical disjunction (OR).
 *
 * @param test1 The first \`TypeTest\`.
 * @param test2 The second \`TypeTest\`.
 * @param test3 The third \`TypeTest\`.
 * @returns The combined \`TypeTest\`.
 */
export function or<T1, T2, T3, INPUT>(
	test1: TypeTest<T1, INPUT>,
	test2: TypeTest<T2, INPUT>,
	test3: TypeTest<T3, INPUT>
): TypeTest<T1 | T2 | T3, INPUT>;

/**
 * Combines four \`TypeTest\` instances as a logical disjunction (OR).
 *
 * @param test1 The first \`TypeTest\`.
 * @param test2 The second \`TypeTest\`.
 * @param test3 The third \`TypeTest\`.
 * @param test4 The fourth \`TypeTest\`.
 * @returns The combined \`TypeTest\`.
 */
export function or<T1, T2, T3, T4, INPUT>(
	test1: TypeTest<T1, INPUT>,
	test2: TypeTest<T2, INPUT>,
	test3: TypeTest<T3, INPUT>,
	test4: TypeTest<T4, INPUT>
): TypeTest<T1 | T2 | T3 | T4, INPUT>;

/**
 * Combines five \`TypeTest\` instances as a logical disjunction (OR).
 *
 * @param test1 The first \`TypeTest\`.
 * @param test2 The second \`TypeTest\`.
 * @param test3 The third \`TypeTest\`.
 * @param test4 The fourth \`TypeTest\`.
 * @param test5 The fifth \`TypeTest\`.
 * @returns The combined \`TypeTest\`.
 */
export function or<T1, T2, T3, T4, T5, INPUT>(
	test1: TypeTest<T1, INPUT>,
	test2: TypeTest<T2, INPUT>,
	test3: TypeTest<T3, INPUT>,
	test4: TypeTest<T4, INPUT>,
	test5: TypeTest<T5, INPUT>
): TypeTest<T1 | T2 | T3 | T4 | T5, INPUT>;

/**
 * Combines multiple \`TypeTest\` instances as a logical disjunction (OR).
 *
 * @deprecated This method should not be used directly.
 * @returns The combined \`TypeTest\`.
 */
export function or<T, INPUT>(): TypeTest<T, INPUT> {
	const tests = Array.from(arguments) as readonly TypeTest<T, INPUT>[];
	return (thing, context) => {
		const messages: string[] = [];
		for (const test of tests) {
			const result = test(thing, context);
			if (isSuccess(result)) return result;
			if (typeof result.message === "string") messages.push(result.message);
		}
		return failure(messages.join(" OR "));
	};
}

/**
 * Wraps a \`TypeTest\` to return \`undefined\` when the input is \`undefined\` or \`null\`.
 *
 * @param test The test to wrap.
 * @returns A \`TypeTest\` that wraps the given \`TypeTest\`.
 */
export function opt<T, INPUT>(
	test: TypeTest<T, INPUT>,
): TypeTest<T | undefined, INPUT> {
	return (thing, context) =>
		isUndefined(thing) ? success(undefined) : test(thing, context);
}

/**
 * Maps the result of a \`TypeTest\`.
 *
 * @param test The test to wrap.
 * @param f The map function.
 * @returns A \`TypeTest\` that maps a result.
 */
export function map<T, U, INPUT>(
	test: TypeTest<T, INPUT>,
	f: (result: T) => U,
): TypeTest<U, INPUT> {
	return (thing, context) => {
		const result = test(thing, context);
		return isSuccess(result) ? success(f(result.value)) : result;
	};
}

/**
 * Helper function for adding an index to the last part of a context.
 *
 * @param context The context to add an index to.
 * @param i The index.
 * @returns The new context.
 */
export function addIndex(context: string[], i: number): string[] {
	if (!context.length) return [i.toString()];
	return [...context.slice(0, -1), \`\${context[context.length - 1]}[\${i}]\`];
}

/**
 * Wraps a \`TypeTest\` to print arrays whose values match the given \`TypeTest\`.
 *
 * @param test The test to wrap.
 * @returns A \`TypeTest\` that wraps the given \`TypeTest\`.
 */
export function printArray<T, INPUT>(
	test: TypeTest<T, INPUT>
): TypeTest<ReadonlyArray<T>, ReadonlyArray<INPUT>> {
	return (thing, context) => {
		const results: T[] = [];
		for (let i = 0; i < thing.length; i++) {
			const result = test(thing[i], addIndex(context, i));
			if (!isSuccess(result)) return result;
			results.push(result.value);
		}
		return success(results);
	};
}

/**
 * Wraps a \`TypeTest\` to validate arrays whose values match the given \`TypeTest\`.
 *
 * @param test The test to wrap.
 * @returns A \`TypeTest\` that wraps the given \`TypeTest\`.
 */
export function testArray<T>(
	test: TypeTest<T, unknown>
): TypeTest<ReadonlyArray<T>, unknown> {
	return (thing, context) => {
		if (Array.isArray(thing)) {
			const results: T[] = [];
			for (let i = 0; i < thing.length; i++) {
				const result = test(thing[i], addIndex(context, i));
				if (!isSuccess(result)) return result;
				results.push(result.value);
			}
			return success(results);
		}
		return failure(
			\`Expected '\${context.join(
				"."
			)}' to be an array, but found: \${thing} (\${typeof thing})\`
		);
	};
}

/**
 * Wraps a \`TypeTest\` to validate arrays whose values match the given \`TypeTest\`, or a single value if the value was not an array.
 *
 * @param test The test to wrap.
 * @returns A \`TypeTest\` that wraps the given \`TypeTest\`.
 */
export function testParamArray<T>(
	test: TypeTest<T, unknown>
): TypeTest<ReadonlyArray<T>, unknown> {
	return or<ReadonlyArray<T>, ReadonlyArray<T>, unknown>(
		testArray(test) as TypeTest<ReadonlyArray<T>, unknown>,
		and(test, (x) => success<ReadonlyArray<T>>([x])) as TypeTest<
			ReadonlyArray<T>,
			unknown
		>
	);
}

/** Validates that something is an object. */
export const testObject: TypeTest<object, unknown> = (thing, context) =>
	typeof thing === "object" && thing !== null
		? success(thing)
		: failure(
				\`Expected '\${context.join(
					"."
				)}' to be an object, but found: \${thing} (\${typeof thing})\`
		  );

/**
 * Converts a map to a plain JSON object.
 *
 * @param map The map to convert.
 * @param printValue The function to convert each object value to JSON.
 * @return A JSON version of \`map\`.
 */
export function printMap<T>(
	test: TypeTest<any, T>
): TypeTest<object, ReadonlyMap<string, T>> {
	return (thing, context) => {
		const results: any = {};
		for (const [key, value] of thing.entries()) {
			const result = test(value, [...context, key]);
			if (!isSuccess(result)) return result;
			results[key] = result.value;
		}
		return success(results);
	};
}

/**
 * Wraps a \`TypeTest\` to validate objects whose values match the given \`TypeTest\`.
 *
 * @param test The test to wrap.
 * @returns A \`TypeTest\` that wraps the given \`TypeTest\`.
 */
export function testMap<T>(
	test: TypeTest<T, unknown>
): TypeTest<ReadonlyMap<string, T>, unknown> {
	return and(testObject, (thing, context) => {
		const map = new Map<string, T>();
		for (const [key, value] of Object.entries(thing)) {
			const result = test(value, [...context, key]);
			if (!isSuccess(result)) return result;
			map.set(key, result.value);
		}
		return success(map);
	});
}

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
 * @param typeRef The type to test against.
 * @returns A \`TypeTest\` for the given type.
 */
export function testType<T>(typeRef: Type<T>): TypeTest<T, unknown> {
	return (thing, context) =>
		thing instanceof typeRef
			? success(thing)
			: failure(
					\`Expected '\${context.join(
						"."
					)}' to be \${typeRef}, but found: \${thing} (\${typeof thing})\`
			  );
}

/** Validates that something is a boolean. */
export const testBoolean: TypeTest<boolean, unknown> = (thing, context) =>
	typeof thing === "boolean"
		? success(thing)
		: failure(
				\`Expected '\${context.join(
					"."
				)}' to be a boolean, but found: \${thing} (\${typeof thing})\`
		  );

/**
 * Validates that something is a boolean, with a default for \`undefined\` or \`null\`.
 *
 * @param defaultValue The default value for \`undefined\` or \`null\`.
 * @returns A \`TypeTest<boolean, unknown>\` for the given default value.
 */
export function testBooleanDefault(defaultValue: boolean): TypeTest<boolean, unknown> {
	return (thing, context) =>
		isUndefined(thing) ? success(defaultValue) : testBoolean(thing, context);
}

/** Tests that a \`BigNumber\` is finite. */
export const testBigNumberFinite: TypeTest<BigNumber, BigNumber> = (
	thing,
	context
) =>
	thing.isFinite()
		? success(thing)
		: failure(
				\`Expected '\${context.join(
					"."
				)}' to be a number, but found: \${thing} (\${typeof thing})\`
		  );

/** Validates that a \`BigNumber\` is an integer. */
export const testBigNumberInteger: TypeTest<BigNumber, BigNumber> = (
	thing,
	context
) =>
	thing.isInteger()
		? success(thing)
		: failure(
				\`Expected '\${context.join(
					"."
				)}' to be an integer, but found: \${thing} (\${typeof thing})\`
		  );

/** Tests that something is a \`BigNumber\` and is finite. */
export const testNumber: TypeTest<BigNumber, unknown> = and(
	testType(BigNumber),
	testBigNumberFinite
);

/** Tests that something is a \`BigNumber\` and is an integer. */
export const testInteger: TypeTest<BigNumber, unknown> = and(
	testNumber,
	testBigNumberInteger
);

/** Validate that something is a string. */
export const testString: TypeTest<string, unknown> = (thing, context) =>
	typeof thing === "string"
		? success(thing)
		: failure(
				\`Expected '\${context.join(
					"."
				)}' to be a string, but found: \${thing} (\${typeof thing})\`
		  );

/**
 * Validate that a string matches a specific regular expression.
 *
 * @param pattern The regular expression to test against.
 * @param message The (optional) message to report in error messages. Used as "Expected ... {message}, but found: ..."
 * @returns A \`TypeTest<RegExpExecArray, string>\` for the given regular expression.
 */
export function testStringRegExp(
	pattern: RegExp,
	message?: string
): TypeTest<RegExpExecArray, string> {
	return (thing, context) => {
		const result = pattern.exec(thing);
		return result !== null
			? success(result)
			: failure(
					\`Expected '\${context.join(".")}' to \${
						message || \`to match \${pattern}\`
					}, but found: \${thing}\`
			  );
	};
}

/**
 * Validate that a string matches a specific regular expression.
 *
 * @param pattern The regular expression to test against.
 * @param message The (optional) message to report in error messages. Used as "Expected ... {message}, but found: ..."
 * @returns A \`TypeTest<string, string>\` for the given regular expression.
 */
export function testStringMatches(
	pattern: RegExp,
	message?: string
): TypeTest<string, string> {
	return and(testStringRegExp(pattern, message), (m) => success(m[0]));
}

/**
 * Validate that something is a string that matches a specific regular expression.
 *
 * @param pattern The regular expression to test against.
 * @param message The (optional) message to report in error messages. Used as "Expected ... to {message}, but found: ..."
 * @returns A \`TypeTest<RegExpExecArray, unknown>\` for the given regular expression.
 */
export function testRegExp(
	pattern: RegExp,
	message?: string
): TypeTest<RegExpExecArray, unknown> {
	return and(testString, testStringRegExp(pattern, message));
}

/**
 * Validate that something is a string that matches a specific regular expression.
 *
 * @param pattern The regular expression to test against.
 * @param message The (optional) message to report in error messages. Used as "Expected ... to {message}, but found: ..."
 * @returns A \`TypeTest<string, unknown>\` for the given regular expression.
 */
export function testMatches(
	pattern: RegExp,
	message?: string
): TypeTest<string, unknown> {
	return and(testString, testStringMatches(pattern, message));
}

/**
 * Validates that a string's length falls in the specified range.
 *
 * @param minLength The (optional) minimum string length.
 * @param maxLength The (optional) maximum string length.
 * @returns A \`TypeTest<string, string>\` for the given string length range.
 */
export function testStringLength(
	minLength: number | undefined,
	maxLength: number | undefined
): TypeTest<string, string> {
	return (thing, context) => {
		if (
			(minLength === undefined || thing.length >= minLength) &&
			(maxLength === undefined || thing.length <= maxLength)
		) {
			return success(thing);
		}
		const message =
			minLength === undefined
				? \`at most \${maxLength}\`
				: maxLength === undefined
				? \`at least \${minLength}\`
				: minLength === maxLength
				? \`exactly \${minLength}\`
				: \`between \${minLength} and \${maxLength}\`;
		return failure(
			\`Expected '\${context.join(
				"."
			)}' to be \${message} characters, but found: \${thing}\`
		);
	};
}

/** Validates that a string is a valid email. */
export const testEmail: TypeTest<string, string> = (thing, context) =>
	EmailValidator.validate(thing)
		? success(thing)
		: failure(
				\`Expected '\${context.join(".")}' to be an email, but found: \${thing}\`
		  );

/** Validates that a string is a valid UUID. */
export const testUuid: TypeTest<string, string> = and(
	testStringLength(36, 36),
	testStringMatches(
		/^[0-9a-f]{12}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{8}$/i,
		"to be a valid UUID"
	)
);

/**
 * Validates that a string represents a boolean.
 *
 * @param trueString The string representing \`true\`.
 * @param falseString The string representing \`false\`.
 * @return A \`TypeTest<boolean, unknown>\` for the given options.
 */
export function testBooleanStrings(
	trueString: string,
	falseString: string
): TypeTest<boolean, unknown> {
	return (thing, context) =>
		thing === trueString
			? success(true)
			: thing === falseString
			? success(false)
			: failure(
					\`Expected '\${context.join(".")}' to be \\\`\${JSON.stringify(
						trueString
					)}\\\` or \\\`\${JSON.stringify(
						falseString
					)}\\\`, but found: \${thing} (\${typeof thing})\`
			  );
}

/**
 * Validates that something is a string representing a boolean.
 *
 * @param trueString The string representing \`true\`.
 * @param falseString The string representing \`false\`.
 * @param undefinedValue The value to return when \`undefined\` or \`null\` are found.
 * @return A \`TypeTest<boolean, unknown>\` for the given options.
 */
export function testBooleanStringsDefault(
	trueString: string,
	falseString: string,
	undefinedValue: boolean
): TypeTest<boolean, unknown> {
	return or(
		(thing) => (isUndefined(thing) ? success(undefinedValue) : failure()),
		testBooleanStrings(trueString, falseString)
	);
}

/** Validates that something is \`"true"\` or \`"false"\`. */
export const testBooleanString: TypeTest<boolean, unknown> = testBooleanStrings(
	"true",
	"false"
);

/**
 * Validates that something is \`"true"\` or \`"false"\`, with a default for \`undefined\` or \`null\`.
 *
 * @param defaultValue The default value for \`undefined\` or \`null\`.
 * @returns A \`TypeTest<boolean, unknown>\` for the given default value.
 */
export function testBooleanStringDefault(
	defaultValue: boolean
): TypeTest<boolean, unknown> {
	return testBooleanStringsDefault("true", "false", defaultValue);
}

/** Validates that something is \`"Y"\` or \`"N"\`. */
export const testBooleanYN: TypeTest<boolean, unknown> = testBooleanStrings("Y", "N");

/**
 * Validates that something is \`"Y"\` or \`"N"\`, with a default for \`undefined\` or \`null\`.
 *
 * @param defaultValue The default value for \`undefined\` or \`null\`.
 * @returns A \`TypeTest<boolean, unknown>\` for the given default value.
 */
export function testBooleanYNDefault(defaultValue: boolean): TypeTest<boolean, unknown> {
	return testBooleanStringsDefault("Y", "N", defaultValue);
}

/** Validates that a string represents a number. */
export const testStringIsNumber: TypeTest<BigNumber, string> = and(
	(s) => success(new BigNumber(s)),
	testBigNumberFinite
);

/** Validates that something is a string representing a number. */
export const testNumberString: TypeTest<BigNumber, unknown> = and(
	testString,
	testStringIsNumber
);

/** Validates that a string represents an integer. */
export const testStringIsInteger: TypeTest<BigNumber, string> = and(
	(s) => success(new BigNumber(s)),
	testBigNumberInteger
);

/** Validates that something is a string representing an integer. */
export const testIntegerString: TypeTest<BigNumber, unknown> = and(
	testString,
	testStringIsInteger
);

/** Validates that a string represents an Oracle date. */
export const testStringIsOracleDate: TypeTest<
	DateTime,
	string
> = and(
	testStringLength(19, 19),
	testStringMatches(/^(d{4})-(d{2})-(d{2})T00:00:00$/, "to be an Oracle date"),
	([, year, month, day]) =>
		success(
			DateTime.utc(parseInt(year, 10), parseInt(month, 10), parseInt(day, 10))
		)
);

/** Validates that something is a string representing an Oracle date. */
export const testOracleDateString: TypeTest<DateTime, unknown> = and(
	testString,
	testStringIsOracleDate
);

/** Validates that a string represents an ISO date. */
export const testStringIsDate: TypeTest<
	DateTime,
	string
> = and(
	testStringLength(10, 10),
	testStringMatches(/^(d{4})-(d{2})-(d{2})$/, "to be an ISO date"),
	([, year, month, day]) =>
		success(
			DateTime.utc(parseInt(year, 10), parseInt(month, 10), parseInt(day, 10))
		)
);

/** Validates that something is a string representing an ISO date. */
export const testDateString: TypeTest<DateTime, unknown> = and(
	testString,
	testStringIsDate
);

/** Validates that a string represents an Oracle date-time. */
export const testStringIsOracleDateTime: TypeTest<DateTime, string> = and(
	testStringLength(19, 19),
	testStringMatches(
		/^(d{4})-(d{2})-(d{2})T(d{2}):(d{2}):(d{2})$/,
		"to be an Oracle date-time"
	),
	([, year, month, day, hour, minute, second]) =>
		success(
			DateTime.fromObject({
				year: parseInt(year, 10),
				month: parseInt(month, 10),
				day: parseInt(day, 10),
				hour: parseInt(hour, 10),
				minute: parseInt(minute, 10),
				second: parseInt(second, 10),
				zone: "America/New_York",
			}).toUTC()
		)
);

/** Validates that something is a string representing an Oracle date-time. */
export const testOracleDateTimeString: TypeTest<DateTime, unknown> = and(
	testString,
	testStringIsOracleDateTime
);

/** Validates that a string represents an ISO date-time. */
export const testStringIsDateTime: TypeTest<
	DateTime,
	string
> = and(
	testStringLength(24, 24),
	testStringMatches(
		/^(d{4})-(d{2})-(d{2})T(d{2}):(d{2}):(d{2}).(d{3})Z$/,
		"to be an Oracle date-time"
	),
	([, year, month, day, hour, minute, second, millisecond]) =>
		success(
			DateTime.utc(
				parseInt(year, 10),
				parseInt(month, 10),
				parseInt(day, 10),
				parseInt(hour, 10),
				parseInt(minute, 10),
				parseInt(second, 10),
				parseInt(millisecond, 10)
			)
		)
);

/** Validates that something is a string representing an ISO date-time. */
export const testDateTimeString: TypeTest<DateTime, unknown> = and(
	testString,
	testStringIsDateTime
);

/**
 * Tests whether something is one of a known list of values.
 *
 * @param thing The thing to test.
 * @param values The list of known values.
 * @return \`true\` if \`thing\` was one of the known values, \`false\` otherwise.
 */
export function isOneOf<T>(
	thing: unknown,
	values: ReadonlyArray<T>
): thing is T {
	return values.includes(thing as T);
}

/**
 * Validates that something is one of a known list of values.
 *
 * @param values The list of known values.
 * @returns A \`TypeTest\` for the given values.
 */
export function testOneOf<T>(values: ReadonlyArray<T>): TypeTest<T, unknown> {
	return (thing, context) =>
		isOneOf(thing, values)
			? success(thing)
			: failure(
					\`Expected '\${context.join(".")}' to be one of [\${values.join(
						", "
					)}], but found: \${thing}\`
			  );
}

/**
 * Validates that something is one of a known list of input values, and maps that value to an output value.
 *
 * @param map The map of known values.
 * @returns A \`TypeTest\` for the given values.
 */
export function mapOneOf<T, U>(map: ReadonlyMap<T, U>): TypeTest<U, unknown> {
	return (thing, context) => {
		for (const [input, output] of map.entries()) {
			if (thing === input) {
				return success(output);
			}
		}
		return failure(
			\`Expected '\${context.join('.')}' to be one of [\${Array.from(
				map.keys(),
			).join(', ')}], but found: \${thing}\`,
		);
	};
}

/** Utility type for building model objects. */
export type TestModelObjectProps<T> = {
	readonly [K in keyof T]-?: TypeTest<T[K], unknown>;
};

/**
 * Validates that something has all of the specified properties.
 *
 * @param name The name of the type, to add to the context.
 * @param props The properties to validate.
 * @returns A \`TypeTest\` for the given properties.
 */
export function testModelObject<T>(
	name: string,
	props: TestModelObjectProps<T>,
): TypeTest<T, unknown> {
	return addContext(
		and(testObject, (thing, context) => {
			const obj: any = {};
			for (const [key, test] of Object.entries(props)) {
				const result = (test as TypeTest<any, unknown>)((thing as any)[key], [
					...context,
					key,
				]);
				if (!isSuccess(result)) return result;
				obj[key] = result.value;
			}
			return success(obj as T);
		}),
		name,
	);
}

/**
 * Validates that a database row has all of the specified properties.
 *
 * @param props The properties to validate.
 * @param context The context to report error messages in.
 * @returns A converter for the given properties.
 */
export function convertRow<T>(
	props: TestModelObjectProps<T>,
	context: string[],
): (row: unknown[]) => T {
	return (row) => {
		const entries = Object.entries(props);
		if (row.length !== entries.length) {
			throw 'Row length did not match number of props.';
		}
		const obj: any = {};
		for (let i = 0; i < row.length; i++) {
			const [key, test] = entries[i];
			const result = (test as TypeTest<any, unknown>)(row[i], [
				...context,
				key,
			]);
			if (!isSuccess(result)) throw result;
			obj[key] = result.value;
		}
		return obj as T;
	};
}

/** Utility type to map DateTime to string. */
export type MapPrintType<T> = T extends ReadonlyArray<infer E>
	? ReadonlyArray<MapPrintType<E>>
	: T extends DateTime
	? string
	: T extends object
	? object
	: T;

/** Utility type for building model objects. */
export type PrintModelObjectProps<T> = {
	readonly [K in keyof T]-?: TypeTest<MapPrintType<T[K]>, T[K]>;
};

/**
 * Validates that something has all of the specified properties.
 *
 * @param name The name of the type, to add to the context.
 * @param props The properties to validate.
 * @returns A \`TypeTest\` for the given properties.
 */
export function printModelObject<T>(
	name: string,
	props: PrintModelObjectProps<T>
): TypeTest<object, T> {
	return addContext(
		and(testObject, (thing, context) => {
			const obj: any = {};
			for (const [key, test] of Object.entries(props)) {
				const result = (test as TypeTest<any, unknown>)((thing as any)[key], [
					...context,
					key,
				]);
				if (!isSuccess(result)) return result;
				obj[key] = result.value;
			}
			return success(obj);
		}),
		name,
	);
}
`;
// #endregion
