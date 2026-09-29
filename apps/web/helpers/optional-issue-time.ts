// SPDX-License-Identifier: AGPL-3.0-only
/** Minute-precision local schedule conversion using the user's IANA timezone. */
export function utcScheduleToLocal(value: string | null | undefined, timeZone: string): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function localScheduleToUtc(value: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid date and time.");
  const wallTime = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallTime) || new Date(wallTime).toISOString().slice(0, 16) !== value) {
    throw new Error("Enter a valid date and time.");
  }
  let candidate = wallTime;
  for (let i = 0; i < 4; i++) {
    const rendered = utcScheduleToLocal(new Date(candidate).toISOString(), timeZone);
    if (rendered === value) return new Date(candidate).toISOString();
    candidate += wallTime - Date.parse(`${rendered}:00Z`);
  }
  throw new Error("This local time does not exist because the clocks change. Choose another time.");
}
