import type { FetActivity, ScheduledActivity } from "./types";

export function parseActivitiesTimetable(xml: string): ScheduledActivity[] {
  if (!xml.trim()) return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Không đọc được activities.xml của FET.");
  }

  return Array.from(doc.querySelectorAll("Activity"))
    .map((activity) => {
      const id = Number(activity.querySelector("Id")?.textContent || "0");
      const dayLabel = activity.querySelector("Day")?.textContent || "";
      const hour = activity.querySelector("Hour")?.textContent || "";
      const room = activity.querySelector("Room")?.textContent || "";
      const periodIndex = parsePeriodIndex(hour);
      return { id, dayLabel, periodIndex, room };
    })
    .filter((activity) => activity.id > 0 && activity.dayLabel && activity.periodIndex >= 0);
}

export function indexScheduledActivities(
  scheduled: ScheduledActivity[],
  activities: FetActivity[]
): Map<number, ScheduledActivity & { activity: FetActivity }> {
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const indexed = new Map<number, ScheduledActivity & { activity: FetActivity }>();
  for (const item of scheduled) {
    const activity = activityById.get(item.id);
    if (activity) indexed.set(item.id, { ...item, activity });
  }
  return indexed;
}

function parsePeriodIndex(hour: string): number {
  const match = hour.match(/(\d+)$/);
  if (!match) return -1;
  return Number(match[1]) - 1;
}
