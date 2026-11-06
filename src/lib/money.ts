import { z } from "zod";

export const currencies = ["CAD", "USD", "EUR", "GBP", "JPY", "AUD"] as const;
export const currencySchema = z.enum(currencies);
export type Currency = z.infer<typeof currencySchema>;
export const minorSchema = z.number().int().min(0).max(1_000_000_000_000);
export const decimals = (currency: Currency) => (currency === "JPY" ? 0 : 2);
const checked = (value: bigint) => {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("This amount exceeds the supported exact monetary range.");
  return Number(value);
};
export function parseMoney(value: string, currency: Currency) {
  const precision = decimals(currency);
  if (
    !new RegExp(`^\\d{1,12}${precision ? "(?:\\.\\d{1,2})?" : ""}$`).test(value)
  )
    throw Error(
      `Enter a positive ${currency} amount with at most ${precision} decimal places.`,
    );
  const [whole, fraction = ""] = value.split(".");
  return minorSchema.parse(
    checked(
      BigInt(whole) * BigInt(10) ** BigInt(precision) +
        BigInt(fraction.padEnd(precision, "0") || "0"),
    ),
  );
}
export function amountText(minor: number, currency: Currency) {
  minorSchema.parse(minor);
  const precision = decimals(currency),
    text = String(minor).padStart(precision + 1, "0");
  return precision
    ? `${text.slice(0, -precision)}.${text.slice(-precision)}`
    : text;
}
// Provider JSON numeric literals are retained as text before conversion. No
// binary floating-point arithmetic participates in a monetary conversion.
export function decimalRatio(rate: string) {
  const match = /^(\d{1,9})(?:\.(\d{1,18}))?(?:[eE]([+-]?\d{1,2}))?$/.exec(
    rate,
  );
  if (!match)
    throw Error("The exchange rate is not a supported exact decimal.");
  let numerator = BigInt(match[1] + (match[2] ?? ""));
  const exponent = Number(match[3] ?? 0) - (match[2]?.length ?? 0);
  if (Math.abs(exponent) > 24)
    throw Error("The exchange rate is outside supported precision.");
  const denominator =
    exponent < 0 ? BigInt(10) ** BigInt(-exponent) : BigInt(1);
  if (exponent > 0) numerator *= BigInt(10) ** BigInt(exponent);
  if (!numerator || numerator > denominator * BigInt(1_000_000))
    throw Error("The exchange rate is outside supported bounds.");
  return { numerator, denominator };
}
export function convertMinor(
  minor: number,
  base: Currency,
  quote: Currency,
  rate: string,
) {
  minorSchema.parse(minor);
  const ratio = decimalRatio(rate);
  const numerator =
    BigInt(minor) * ratio.numerator * BigInt(10) ** BigInt(decimals(quote));
  const denominator = ratio.denominator * BigInt(10) ** BigInt(decimals(base));
  return minorSchema.parse(
    checked((numerator * BigInt(2) + denominator) / (BigInt(2) * denominator)),
  );
}
export function exactSum(values: number[]) {
  return checked(
    values.reduce((sum, v) => {
      if (!Number.isSafeInteger(v) || v < 0)
        throw Error("Invalid monetary amount.");
      return sum + BigInt(v);
    }, BigInt(0)),
  );
}
