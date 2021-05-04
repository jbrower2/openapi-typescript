import { capitalize } from "./string-utils";

export class Identifier {
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
