import { Imports } from "./imports";

export class StringBuilder {
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
