export type OpenAPI = {
	openapi: string;
	info: OpenAPIInfo;
	servers?: OpenAPIServer[];
	paths: Record<string, OpenAPIPathItem>;
	components?: OpenAPIComponents;
	security?: OpenAPISecurityRequirement[];
	tags?: OpenAPITag[];
	externalDocs?: OpenAPIExternalDocumentation;
};

export type OpenAPIInfo = {
	title: string;
	description?: string;
	termsOfService?: string;
	contact?: OpenAPIContact;
	license?: OpenAPILicense;
	version: string;
};

export type OpenAPIContact = {
	name?: string;
	url?: string;
	email?: string;
};

export type OpenAPILicense = {
	name: string;
	url?: string;
};

export type OpenAPIServer = {
	url: string;
	description?: string;
	variables?: Record<string, OpenAPIServerVariable>;
};

export type OpenAPIServerVariable = {
	enum?: string[];
	default: string;
	description?: string;
};

export type OpenAPIComponents = {
	schemas?: Record<string, OpenAPISchema | OpenAPIReference>;
	responses?: Record<string, OpenAPIResponse | OpenAPIReference>;
	parameters?: Record<string, OpenAPIParameter | OpenAPIReference>;
	examples?: Record<string, OpenAPIExample | OpenAPIReference>;
	requestBodies?: Record<string, OpenAPIRequestBody | OpenAPIReference>;
	headers?: Record<string, OpenAPIHeader | OpenAPIReference>;
	securitySchemes?: Record<string, OpenAPISecurityScheme | OpenAPIReference>;
	links?: Record<string, OpenAPILink | OpenAPIReference>;
	callbacks?: Record<string, OpenAPICallback | OpenAPIReference>;
};

export type OpenAPIPathItem = {
	$ref?: string;
	summary?: string;
	description?: string;
	get?: OpenAPIOperation;
	put?: OpenAPIOperation;
	post?: OpenAPIOperation;
	delete?: OpenAPIOperation;
	options?: OpenAPIOperation;
	head?: OpenAPIOperation;
	patch?: OpenAPIOperation;
	trace?: OpenAPIOperation;
	servers?: OpenAPIServer;
	parameters?: (OpenAPIParameter | OpenAPIReference)[];
};

export type OpenAPIOperation = {
	tags?: string[];
	summary?: string;
	description?: string;
	externalDocs?: OpenAPIExternalDocumentation;
	operationId?: string;
	parameters?: (OpenAPIParameter | OpenAPIReference)[];
	requestBody?: OpenAPIRequestBody | OpenAPIReference;
	responses: OpenAPIResponses;
	callbacks?: Record<string, OpenAPICallback | OpenAPIReference>;
	deprecated?: boolean;
	security?: OpenAPISecurityRequirement[];
	servers?: OpenAPIServer[];
};

export type OpenAPIExternalDocumentation = {
	description?: string;
	url: string;
};

export type OpenAPIParameter = OpenAPIHeader & {
	name: string;
	in: "query" | "header" | "path" | "cookie";
};

export type OpenAPIRequestBody = {
	description?: string;
	content: Record<string, OpenAPIMediaType>;
	required?: boolean;
};

export type OpenAPIMediaType = {
	schema?: OpenAPISchema | OpenAPIReference;
	example?: any;
	examples?: Record<string, OpenAPIExample | OpenAPIReference>;
	encoding?: Record<string, OpenAPIEncoding>;
};

export type OpenAPIEncoding = {
	contentType?: string;
	headers?: Record<string, OpenAPIHeader | OpenAPIReference>;
	style?: string;
	explode?: boolean;
	allowReserved?: boolean;
};

export type OpenAPIResponses = Record<
	HttpStatusCode,
	OpenAPIResponse | OpenAPIReference
> & {
	default?: OpenAPIResponse | OpenAPIReference;
};

export type OpenAPIResponse = {
	description: string;
	headers?: Record<string, OpenAPIHeader | OpenAPIReference>;
	content?: Record<string, OpenAPIMediaType>;
	links?: Record<string, OpenAPILink | OpenAPIReference>;
};

export type OpenAPICallback = Record<string, OpenAPIPathItem>;

export type OpenAPIExample = {
	summary?: string;
	description?: string;
	value?: any;
	externalValue?: string;
};

export type OpenAPILink = {
	operationRef?: string;
	operationId?: string;
	parameters?: Record<string, any>;
	requestBody?: any;
	description?: string;
	server?: OpenAPIServer;
};

export type OpenAPIHeader = {
	description?: string;
	required?: boolean;
	deprecated?: boolean;
	allowEmptyValue?: boolean;
	style?: string;
	explode?: boolean;
	allowReserved?: boolean;
	schema?: OpenAPISchema | OpenAPIReference;
	example?: any;
	examples?: Record<string, OpenAPIExample | OpenAPIReference>;
	content?: Record<string, OpenAPIMediaType>;
};

export type OpenAPITag = {
	name: string;
	description?: string;
	externalDocs?: OpenAPIExternalDocumentation;
};

export type OpenAPIReference = {
	$ref: string;
};

export type OpenAPISchema = {
	title?: string;
	multipleOf?: number;
	maximum?: number;
	exclusiveMaximum?: boolean;
	minimum?: number;
	exclusiveMinimum?: boolean;
	maxLength?: number;
	minLength?: number;
	pattern?: string;
	maxItems?: number;
	minItems?: number;
	uniqueItems?: boolean;
	maxProperties?: number;
	minProperties?: number;
	required?: string[];
	enum?: any[];
	type?:
		| "null"
		| "boolean"
		| "object"
		| "array"
		| "number"
		| "string"
		| "integer";
	allOf?: (OpenAPISchema | OpenAPIReference)[];
	oneOf?: (OpenAPISchema | OpenAPIReference)[];
	anyOf?: (OpenAPISchema | OpenAPIReference)[];
	not?: OpenAPISchema | OpenAPIReference;
	items?: OpenAPISchema | OpenAPIReference;
	properties?: Record<string, OpenAPISchema | OpenAPIReference>;
	additionalProperties?: boolean | OpenAPISchema | OpenAPIReference;
	description?: string;
	format?:
		| "binary"
		| "byte"
		| "date-time"
		| "date"
		| "double"
		| "email"
		| "float"
		| "hostname"
		| "int32"
		| "int64"
		| "ipv4"
		| "ipv6"
		| "password"
		| "uri"
		| "uriref"
		| "uuid";
	default?: any;
	nullable?: boolean;
	discriminator?: OpenAPIDiscriminator;
	readOnly?: boolean;
	writeOnly?: boolean;
	xml?: OpenAPIXML;
	externalDocs?: OpenAPIExternalDocumentation;
	example?: any;
	deprecated?: boolean;
};

export type OpenAPIDiscriminator = {
	propertyName: string;
	mapping?: Record<string, string>;
};

export type OpenAPIXML = {
	name?: string;
	namespace?: string;
	prefix?: string;
	attribute?: boolean;
	wrapped?: boolean;
};

export type OpenAPISecuritySchemeApiKey = {
	type: "apiKey";
	description?: string;
	name: string;
	in: "query" | "header" | "cookie";
};

export type OpenAPISecuritySchemeHttp = {
	type: "http";
	description?: string;
	scheme: string;
	bearerFormat?: string;
};

export type OpenAPISecuritySchemeOAuth2 = {
	type: "oauth2";
	description?: string;
	flows: OpenAPIOAuthFlows;
};

export type OpenAPISecuritySchemeOpenIdConnect = {
	type: "openIdConnect";
	description?: string;
	openIdConnectUrl: string;
};

export type OpenAPISecurityScheme =
	| OpenAPISecuritySchemeApiKey
	| OpenAPISecuritySchemeHttp
	| OpenAPISecuritySchemeOAuth2
	| OpenAPISecuritySchemeOpenIdConnect;

export type OpenAPIOAuthFlows = {
	implicit?: OpenAPIOAuthFlow & OpenAPIOAuthFlowAuthorizationUrl;
	password?: OpenAPIOAuthFlow & OpenAPIOAuthFlowTokenUrl;
	clientCredentials?: OpenAPIOAuthFlow & OpenAPIOAuthFlowTokenUrl;
	authorizationCode?: OpenAPIOAuthFlow &
		OpenAPIOAuthFlowAuthorizationUrl &
		OpenAPIOAuthFlowTokenUrl;
};

export type OpenAPIOAuthFlowAuthorizationUrl = {
	authorizationUrl: string;
};

export type OpenAPIOAuthFlowTokenUrl = {
	tokenUrl: string;
};

export type OpenAPIOAuthFlow = {
	refreshUrl?: string;
	scopes: Record<string, string>;
};

export type OpenAPISecurityRequirement = Record<string, string>;

export type HttpStatusCode =
	| "1XX"
	| "100"
	| "101"
	| "102"
	| "103"
	//
	| "2XX"
	| "200"
	| "201"
	| "202"
	| "203"
	| "204"
	| "205"
	| "206"
	| "207"
	| "208"
	| "226"
	//
	| "3XX"
	| "300"
	| "301"
	| "302"
	| "303"
	| "304"
	| "305"
	| "306"
	| "307"
	| "308"
	//
	| "4XX"
	| "400"
	| "401"
	| "402"
	| "403"
	| "404"
	| "405"
	| "406"
	| "407"
	| "408"
	| "409"
	| "410"
	| "411"
	| "412"
	| "413"
	| "414"
	| "415"
	| "416"
	| "417"
	| "421"
	| "422"
	| "423"
	| "424"
	| "425"
	| "426"
	| "427"
	| "428"
	| "429"
	| "430"
	| "431"
	| "451"
	//
	| "5XX"
	| "500"
	| "501"
	| "502"
	| "503"
	| "504"
	| "505"
	| "506"
	| "507"
	| "508"
	| "509"
	| "510"
	| "511";

export function isReference(x: any): x is OpenAPIReference {
	return x && "$ref" in x;
}
