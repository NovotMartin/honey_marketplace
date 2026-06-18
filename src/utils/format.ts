const jarPluralRules = new Intl.PluralRules("cs-CZ");

export function formatJarCount(count: number) {
  const category = jarPluralRules.select(count);
  const unit = category === "other" ? "sklenic" : "sklenice";
  return `${count} ${unit}`;
}

export function money(value: number) {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);
}

export function dateShort(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function dateOnly(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(value));
}

export function dateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
