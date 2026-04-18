import { format, parseISO } from "date-fns";

export function shiftDateKey(dateKey: string, offsetDays: number) {
  const date = parseISO(dateKey);
  const next = new Date(date);
  next.setDate(next.getDate() + offsetDays);
  return format(next, "yyyy-MM-dd");
}

export function formatDateLabel(dateKey: string) {
  return format(parseISO(dateKey), "EEEE, MMMM d");
}

export function todayKey() {
  return format(new Date(), "yyyy-MM-dd");
}
