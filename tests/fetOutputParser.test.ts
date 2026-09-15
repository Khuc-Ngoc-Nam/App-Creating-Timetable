import { describe, expect, it } from "vitest";
import { parseActivitiesTimetable } from "../src/core/fetOutputParser";

describe("fetOutputParser", () => {
  it("reads FET activities.xml output", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Activities_Timetable>
  <Activity>
    <Id>3</Id>
    <Day>S2</Day>
    <Hour>Tiết 2</Hour>
    <Room></Room>
  </Activity>
</Activities_Timetable>`;

    expect(parseActivitiesTimetable(xml)).toEqual([
      { id: 3, dayLabel: "S2", periodIndex: 1, room: "" }
    ]);
  });
});
