import { describe, expect, it } from "vitest";
import { buildFetFile } from "../src/core/fetSerializer";
import { createSampleProject } from "../src/core/sampleData";

describe("fetSerializer", () => {
  it("serializes full-day primary settings to FET mornings-afternoons mode", () => {
    const project = createSampleProject();
    const result = buildFetFile(project);

    expect(result.errors).toEqual([]);
    expect(result.xml).toContain("<Mode>Mornings_Afternoons</Mode>");
    expect(result.xml).toContain("<Number_of_Days>10</Number_of_Days>");
    expect(result.xml).toContain("<Name>S2</Name>");
    expect(result.xml).toContain("<Name>C6</Name>");
    expect(result.xml).toContain("<Real_Days_List>");
    expect(result.xml).toContain("<Number_of_Real_Days>5</Number_of_Real_Days>");
    expect(result.xml).toContain("<Number_of_Hours>4</Number_of_Hours>");
    expect(result.xml).toContain("<Number_of_Real_Hours>8</Number_of_Real_Hours>");
  });

  it("emits exact FET constraints used by the MVP", () => {
    const project = createSampleProject();
    project.constraints.teacherUnavailableTimes.push({
      teacherName: "Huệ",
      slots: [{ dayLabel: "C2", periodIndex: 3 }]
    });
    project.assignments.find((assignment) => assignment.className === "1A" && assignment.subjectName === "Tiếng Việt")!.weight = 0.99;

    const result = buildFetFile(project);

    expect(result.xml).toContain("<ConstraintBasicCompulsoryTime>");
    expect(result.xml).toContain("<ConstraintBasicCompulsorySpace>");
    expect(result.xml).toContain("<ConstraintTeachersMaxGapsPerDay>");
    expect(result.xml).toContain("<Max_Gaps>1</Max_Gaps>");
    expect(result.xml).toContain("<ConstraintStudentsMaxGapsPerDay>");
    expect(result.xml).toContain("<ConstraintTeacherNotAvailableTimes>");
    expect(result.xml).toContain("<Teacher>Huệ</Teacher>");
    expect(result.xml).toContain("<Day>C2</Day>");
    expect(result.xml).toContain("<Hour>Tiết 4</Hour>");
    expect(result.xml).toContain("<ConstraintMinDaysBetweenActivities>");
    expect(result.xml).toContain("<Weight_Percentage>99</Weight_Percentage>");
    expect(result.xml).toContain("<Consecutive_If_Same_Day>true</Consecutive_If_Same_Day>");
    expect(result.xml).toContain("<ConstraintActivityPreferredStartingTime>");
    expect(result.xml).toContain("<Permanently_Locked>true</Permanently_Locked>");
    expect(result.xml).toContain("<ConstraintTeacherMinRealDaysPerWeek>");
    expect(result.xml).toContain("<Minimum_Days_Per_Week>5</Minimum_Days_Per_Week>");
    expect(result.xml).toContain("<ConstraintTeacherMinHoursDaily>");
    expect(result.xml).toContain("<Minimum_Hours_Daily>2</Minimum_Hours_Daily>");
    expect(result.xml).toContain("<Allow_Empty_Days>true</Allow_Empty_Days>");
    expect(result.xml).toContain("<ConstraintActivitiesOccupyMinTimeSlotsFromSelection>");
    expect(result.xml).toContain("<Min_Number_of_Occupied_Time_Slots>1</Min_Number_of_Occupied_Time_Slots>");
  });

  it("only locks the first split for preferred time constraints", () => {
    const project = createSampleProject();
    project.constraints.preferredTimes.push({
      id: "pref-vietnamese-first-split",
      campusName: project.settings.campuses[0].name,
      subjectName: "Tiếng Việt",
      className: "1A",
      teacherName: "",
      tag: "",
      dayLabel: "S3",
      periodIndex: 0,
      weight: 1,
      permanentlyLocked: true
    });

    const result = buildFetFile(project);
    const occurrences = result.xml.match(/<Day>S3<\/Day>\n      <Hour>Tiết 1<\/Hour>/g) || [];

    expect(occurrences).toHaveLength(1);
  });

  it("uses normal days for homeroom teachers in single-session mode", () => {
    const project = createSampleProject();
    project.settings.mode = "single-session";
    const result = buildFetFile(project);

    expect(result.xml).toContain("<Mode>Official</Mode>");
    expect(result.xml).toContain("<ConstraintTeacherMinDaysPerWeek>");
    expect(result.xml).not.toContain("<ConstraintTeacherMinRealDaysPerWeek>");
  });

  it("skips min-session-hours for teachers whose total load is lower than the minimum", () => {
    const project = createSampleProject();
    project.teachers.push({ id: "one-hour", name: "Một tiết", campusNames: [project.settings.campuses[0].name], morningsAfternoonsBehavior: "Unrestricted" });
    project.assignments.push({
      id: "one-hour-assignment",
      campusName: project.settings.campuses[0].name,
      className: "1A",
      subjectName: "AN",
      teacherName: "Một tiết",
      weeklyPeriods: 1,
      isMainSubject: false,
      tag: "",
      splitPattern: "1",
      minDays: 0,
      weight: 1,
      consecutiveIfSameDay: true
    });

    const result = buildFetFile(project);

    expect(result.warnings.some((warning) => warning.includes("Một tiết"))).toBe(true);
    expect(result.xml).not.toContain("<Teacher>Một tiết</Teacher>\n      <Minimum_Hours_Daily>2</Minimum_Hours_Daily>");
  });

  it("maps multiple campuses to FET buildings and keeps shared teachers global", () => {
    const project = createSampleProject();
    const campusB = "School B";
    project.constraints.basic.homeroomTeachersAllRealDaysEnabled = false;
    project.constraints.basic.mainSubjectAfterFlagCeremonyEnabled = false;
    project.constraints.basic.teacherMaxCampusChangesPerWeekEnabled = true;
    project.constraints.basic.teacherMaxCampusChangesPerWeek = 1;
    project.settings.campuses.push({ id: campusB, name: campusB });
    project.classes.push({ id: `${campusB}-1A`, name: "1A", campusName: campusB, homeroomTeacherName: "Shared Teacher" });
    project.teachers.push({ id: "shared-teacher", name: "Shared Teacher", campusNames: [project.settings.campuses[0].name, campusB], morningsAfternoonsBehavior: "Unrestricted" });
    project.subjects.push({ id: "PE", name: "PE" });
    project.assignments.push({
      id: "shared-teacher-campus-b",
      campusName: campusB,
      className: "1A",
      subjectName: "PE",
      teacherName: "Shared Teacher",
      weeklyPeriods: 1,
      isMainSubject: false,
      tag: "",
      splitPattern: "1",
      minDays: 0,
      weight: 1,
      consecutiveIfSameDay: true
    });

    const result = buildFetFile(project);

    expect(result.errors).toEqual([]);
    expect(result.xml).toContain("<Buildings_List>");
    expect(result.xml).toContain("<Name>School B</Name>");
    expect(result.xml).toContain("<Students>School B - 1A</Students>");
    expect(result.xml).toContain("<Building>School B</Building>");
    expect(result.xml).toContain("<ConstraintStudentsSetHomeRoom>");
    expect(result.xml).toContain("<ConstraintTeachersMaxBuildingChangesPerDay>");
    expect(result.xml).toContain("<Max_Building_Changes_Per_Day>0</Max_Building_Changes_Per_Day>");
    expect(result.xml).toContain("<ConstraintTeachersMaxBuildingChangesPerWeek>");
    expect(result.xml).toContain("<Max_Building_Changes_Per_Week>1</Max_Building_Changes_Per_Week>");
  });

  it("serializes global per-teacher real-day and session workload limits", () => {
    const project = createSampleProject();
    project.constraints.basic.homeroomTeachersAllRealDaysEnabled = false;
    project.constraints.teacherWorkloadLimits.push({
      teacherName: "Huệ",
      maxRealDays: 4,
      minRealDays: 3,
      maxSessions: 7,
      minSessions: 5,
      maxMornings: 4,
      maxAfternoons: 2,
      minMornings: 3,
      minAfternoons: 1,
      weight: 0.99
    });

    const result = buildFetFile(project);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.xml).toContain("<ConstraintTeacherMaxRealDaysPerWeek>");
    expect(result.xml).toContain("<ConstraintTeacherMinRealDaysPerWeek>");
    expect(result.xml).toContain("<ConstraintTeacherMaxDaysPerWeek>");
    expect(result.xml).toContain("<ConstraintTeacherMinDaysPerWeek>");
    expect(result.xml).toContain("<ConstraintTeacherMaxMorningsPerWeek>");
    expect(result.xml).toContain("<ConstraintTeacherMaxAfternoonsPerWeek>");
    expect(result.xml).toContain("<ConstraintTeacherMinMorningsPerWeek>");
    expect(result.xml).toContain("<ConstraintTeacherMinAfternoonsPerWeek>");
    expect(result.xml).toContain("<Weight_Percentage>99</Weight_Percentage>");
    expect(result.xml).toContain("<Max_Days_Per_Week>4</Max_Days_Per_Week>");
    expect(result.xml).toContain("<Minimum_Days_Per_Week>3</Minimum_Days_Per_Week>");
    expect(result.xml).toContain("<Max_Days_Per_Week>7</Max_Days_Per_Week>");
    expect(result.xml).toContain("<Minimum_Days_Per_Week>5</Minimum_Days_Per_Week>");
    expect(result.xml).toContain("<Max_Mornings_Per_Week>4</Max_Mornings_Per_Week>");
    expect(result.xml).toContain("<Max_Afternoons_Per_Week>2</Max_Afternoons_Per_Week>");
    expect(result.xml).toContain("<Minimum_Mornings_Per_Week>3</Minimum_Mornings_Per_Week>");
    expect(result.xml).toContain("<Minimum_Afternoons_Per_Week>1</Minimum_Afternoons_Per_Week>");
  });

  it("rejects split durations that exceed periods per session", () => {
    const project = createSampleProject();
    project.assignments[0].splitPattern = "5 + 5 + 4";
    const result = buildFetFile(project);

    expect(result.errors.length).toBeGreaterThan(0);
  });
});



