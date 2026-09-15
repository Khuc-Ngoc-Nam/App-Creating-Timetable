import type { FetCalendar, TimeSlot, TimetableSettings } from "./types";

export function buildCalendar(settings: TimetableSettings): FetCalendar {
  const realDayNames = Array.from({ length: settings.numberOfDays }, (_, index) => {
    return `T${settings.daysStartAt + index}`;
  });

  const hourNames = Array.from({ length: settings.periodsPerSession }, (_, index) => {
    return `Tiết ${index + 1}`;
  });

  if (settings.mode === "full-day") {
    return {
      modeName: "Mornings_Afternoons",
      dayNames: realDayNames.flatMap((day) => [`S${day.slice(1)}`, `C${day.slice(1)}`]),
      realDayNames,
      hourNames,
      realHourNames: [
        ...hourNames.map((hour) => `Sáng ${hour}`),
        ...hourNames.map((hour) => `Chiều ${hour}`)
      ]
    };
  }

  return {
    modeName: "Official",
    dayNames: realDayNames,
    realDayNames: [],
    hourNames,
    realHourNames: []
  };
}

export function slotKey(slot: TimeSlot): string {
  return `${slot.dayLabel}::${slot.periodIndex}`;
}

export function sameSlot(a: TimeSlot, b: TimeSlot): boolean {
  return a.dayLabel === b.dayLabel && a.periodIndex === b.periodIndex;
}

export function isValidSlot(calendar: FetCalendar, slot: TimeSlot): boolean {
  return calendar.dayNames.includes(slot.dayLabel) && slot.periodIndex >= 0 && slot.periodIndex < calendar.hourNames.length;
}
