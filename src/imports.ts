import { StringBuilder } from "./string-builder";

export type ImportFolder = "api" | "client" | "model" | undefined;

export class Imports {
	private imports: {
		[file: string]: {
			def?: string;
			named: Set<string>;
		};
	} = {};

	constructor(private folder: ImportFolder) {}

	addGlobal(file: string, name: string, def?: true) {
		const i = this.imports[file] || (this.imports[file] = { named: new Set() });
		if (!def) {
			i.named.add(name);
		} else if (i.def) {
			if (i.def !== name) {
				throw `Default import already specified`;
			}
		} else {
			i.def = name;
		}
	}

	addLocal(folder: ImportFolder, file: string, name: string, def?: true) {
		let relative;
		if (folder === this.folder) relative = ".";
		else if (!folder) relative = "..";
		else if (!this.folder) relative = `./${folder}`;
		else relative = `../${folder}`;
		this.addGlobal(`${relative}/${file}`, name, def);
	}

	addValidate(name: string) {
		this.addLocal(undefined, "type-utils", name);
	}

	toString(): string {
		const b = new StringBuilder();
		b.append("\n\n");
		for (const [file, { def, named: namedSet }] of Object.entries(
			this.imports
		).sort(([a], [b]) => a.localeCompare(b))) {
			const named = Array.from(namedSet).sort((a, b) => a.localeCompare(b));
			b.append("import { ");
			if (def) {
				b.append("default as ");
				b.append(def);
				if (named.length) {
					b.append(", ");
				}
			}
			named.forEach((n, i) => {
				if (i > 0) {
					b.append(", ");
				}
				b.append(n);
			});
			b.append(" } from ");
			b.append(JSON.stringify(file));
			b.append(";");
		}
		b.append("\n\n");
		return b.toString();
	}
}
