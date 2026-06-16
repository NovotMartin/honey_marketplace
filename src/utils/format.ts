const jarPluralRules = new Intl.PluralRules("cs-CZ");

export function formatJarCount(count: number) {
  const category = jarPluralRules.select(count);
  const unit = category === "other" ? "sklenic" : "sklenice";
  return `${count} ${unit}`;
}

export function money(value: number) {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);
}
