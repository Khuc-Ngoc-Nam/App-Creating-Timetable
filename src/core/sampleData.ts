import type { Assignment, TimetableProject } from "./types";
import { defaultSplitPattern } from "./splitPattern";

const classes = ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B", "5A", "5B", "5C"];
const defaultCampusName = "Trường Tiểu Học";
const subjects = [
  "AN",
  "Tiếng Việt",
  "Toán",
  "Toán rèn",
  "Đạo Đức",
  "TNXH",
  "Âm nhạc",
  "Mĩ thuật",
  "GDTC",
  "HĐTN",
  "Tiếng anh",
  "Công nghệ",
  "Khoa học",
  "LS và ĐL",
  "Tin học",
  "Chào cờ"
];
const teachers = [
  "Huệ",
  "Bình",
  "Mỹ",
  "Huyền",
  "Vũ Hoa",
  "Thanh",
  "Hoài",
  "Nhâm",
  "Bùi Hoa",
  "Len",
  "Hoà",
  "Thúy",
  "Mùi",
  "Phượng",
  "Nụ",
  "Trường",
  "Nam",
  "Hà",
  "Ngọc Anh"
];

const mainTeachers: Record<string, string> = {
  "1A": "Huệ",
  "1B": "Bình",
  "2A": "Mỹ",
  "2B": "Huyền",
  "3A": "Vũ Hoa",
  "3B": "Thanh",
  "4A": "Hoài",
  "4B": "Nhâm",
  "5A": "Bùi Hoa",
  "5B": "Len",
  "5C": "Hoà"
};

const vietnamesePeriods: Record<string, number> = {
  "1A": 14,
  "1B": 14,
  "2A": 12,
  "2B": 12,
  "3A": 9,
  "3B": 9,
  "4A": 8,
  "4B": 8,
  "5A": 8,
  "5B": 8,
  "5C": 8
};

const mathPeriods: Record<string, number> = {
  "1A": 3,
  "1B": 3,
  "2A": 5,
  "2B": 5,
  "3A": 7,
  "3B": 7,
  "4A": 6,
  "4B": 6,
  "5A": 5,
  "5B": 6,
  "5C": 6
};

export function createSampleProject(): TimetableProject {
  const assignments: Assignment[] = [];

  for (const className of classes) {
    const teacherName = mainTeachers[className];
    assignments.push(makeAssignment(className, "Tiếng Việt", teacherName, vietnamesePeriods[className]));
    assignments.push(makeAssignment(className, "Toán", teacherName, mathPeriods[className]));
    assignments.push(makeAssignment(className, "Đạo Đức", className.startsWith("4") || className.startsWith("5") ? "Phượng" : "Thúy", 1));
    assignments.push(makeAssignment(className, "Âm nhạc", "Phượng", 1));
    assignments.push(makeAssignment(className, "Mĩ thuật", "Nụ", 1));
    assignments.push(makeAssignment(className, "GDTC", "Trường", 2));
    assignments.push(makeAssignment(className, "HĐTN", teacherName, 1));
    assignments.push(makeAssignment(className, "HĐTN", "Nụ", 1));
    assignments.push(makeAssignment(className, "Tiếng anh", className.startsWith("4") || className.startsWith("5") ? "Hà" : "Nam", className.startsWith("1") || className.startsWith("2") ? 2 : 4));
    assignments.push(makeAssignment(className, "Tin học", "Ngọc Anh", 1));
    assignments.push(makeAssignment(className, "Chào cờ", "", 1, "Toàn trường"));
  }

  for (const className of ["1A", "1B", "2A", "2B"]) {
    assignments.push(makeAssignment(className, "TNXH", className === "1A" || className === "1B" ? "Thúy" : "Mùi", 2));
  }
  assignments.push(makeAssignment("1A", "Toán rèn", "Thúy", 2));
  assignments.push(makeAssignment("1B", "Toán rèn", "Thúy", 2));
  assignments.push(makeAssignment("2A", "Toán rèn", "Thúy", 1));
  assignments.push(makeAssignment("2A", "Toán rèn", "Mùi", 1));
  assignments.push(makeAssignment("2B", "Toán rèn", "Mùi", 2));

  for (const className of ["3A", "3B", "4A", "4B", "5A", "5B", "5C"]) {
    const teacherName = mainTeachers[className];
    if (className.startsWith("3")) {
      assignments.push(makeAssignment(className, "TNXH", teacherName, 2));
    } else {
      assignments.push(makeAssignment(className, "Công nghệ", teacherName, 1));
      assignments.push(makeAssignment(className, "Khoa học", teacherName, 2));
      assignments.push(makeAssignment(className, "LS và ĐL", teacherName, 2));
    }
  }

  return {
    settings: {
      institutionName: "Trường Tiểu Học",
      campuses: [{ id: defaultCampusName, name: defaultCampusName }],
      mode: "full-day",
      numberOfDays: 5,
      periodsPerSession: 4,
      daysStartAt: 2
    },
    classes: classes.map((name) => ({ id: `${defaultCampusName}-${name}`, name, campusName: defaultCampusName, homeroomTeacherName: mainTeachers[name] })),
    subjects: subjects.map((name) => ({ id: name, name })),
    teachers: teachers.map((name) => ({
      id: name,
      name,
      campusNames: [defaultCampusName],
      morningsAfternoonsBehavior: "Unrestricted"
    })),
    assignments,
    constraints: {
      basic: {
        teacherMaxGapsPerDayEnabled: true,
        teacherMaxGapsPerDay: 1,
        studentsMaxGapsPerDayEnabled: true,
        studentsMaxGapsPerDay: 0,
        homeroomTeachersAllRealDaysEnabled: true,
        teacherMinHoursDailyEnabled: true,
        teacherMinHoursDaily: 2,
        teacherMinHoursDailySkipLowTotalTeachers: true,
        mainSubjectAfterFlagCeremonyEnabled: true,
        teacherMaxCampusChangesPerSessionEnabled: true,
        teacherMaxCampusChangesPerSession: 0,
        teacherMinGapsBetweenCampusChangesEnabled: false,
        teacherMinGapsBetweenCampusChanges: 1,
        teacherMaxCampusChangesPerRealDayEnabled: false,
        teacherMaxCampusChangesPerRealDay: 1,
        teacherMaxCampusChangesPerWeekEnabled: false,
        teacherMaxCampusChangesPerWeek: 1
      },
      teacherUnavailableTimes: [],
      preferredTimes: [
        {
          id: "pref-chao-co",
          campusName: "",
          subjectName: "Chào cờ",
          className: "",
          teacherName: "",
          tag: "Toàn trường",
          dayLabel: "S2",
          periodIndex: 0,
          weight: 1,
          permanentlyLocked: true
        }
      ],
      teacherWorkloadLimits: [],
      sameTimeGroups: []
    },
    subjectColors: {
      "Tiếng Việt": "#dff3e4",
      "Toán": "#e4edff",
      "Toán rèn": "#eef0ff",
      "Đạo Đức": "#fff1d8",
      "TNXH": "#e7f5f5",
      "Âm nhạc": "#fde8f2",
      "Mĩ thuật": "#f9ecdc",
      "GDTC": "#e4f6dc",
      "HĐTN": "#fff7c7",
      "Tiếng anh": "#e4f0ff",
      "Công nghệ": "#eeeeee",
      "Khoa học": "#dff7ef",
      "LS và ĐL": "#f3e9ff",
      "Tin học": "#e0f2fe",
      "Chào cờ": "#ffe0e0"
    }
  };
}

function makeAssignment(className: string, subjectName: string, teacherName: string, weeklyPeriods: number, tag = ""): Assignment {
  return {
    id: `${className}-${subjectName}-${teacherName || "school"}-${Math.random().toString(36).slice(2, 7)}`,
    campusName: defaultCampusName,
    className,
    subjectName,
    teacherName,
    weeklyPeriods,
    isMainSubject: isDefaultMainSubject(subjectName),
    tag,
    splitPattern: defaultSplitPattern(weeklyPeriods, 4, 5),
    minDays: weeklyPeriods > 1 ? 1 : 0,
    weight: 1,
    consecutiveIfSameDay: true
  };
}

function isDefaultMainSubject(subjectName: string): boolean {
  return subjectName === "Tiếng Việt" || subjectName === "Toán";
}
