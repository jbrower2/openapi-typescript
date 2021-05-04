export const capitalize = (s: string) =>
	`${s[0].toUpperCase()}${s.substring(1)}`;

export const uncapitalize = (s: string) =>
	`${s[0].toLowerCase()}${s.substring(1)}`;
