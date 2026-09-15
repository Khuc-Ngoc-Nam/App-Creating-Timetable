export type TimetableMode = "single-session" | "full-day";

export type TeacherMorningAfternoonBehavior =
  | "Unrestricted"
  | "Exclusive"
  | "One day exception"
  | "Two days exception";

export interface Teacher {
  id: string;
  name: string;
  campusNames: string[];
  targetHours?: number;
  morningsAfternoonsBehavior?: TeacherMorningAfternoonBehavior;
}

export interface Campus {
  id: string;
  name: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  campusName: string;
  studentCount?: number;
  homeroomTeacherName?: string;
}

export interface Subject {
  id: string;
  name: string;
}

export interface TimeSlot {
  dayLabel: string;
  periodIndex: number;
}

export interface TimetableSettings {
  institutionName: string;
  campuses: Campus[];
  mode: TimetableMode;
  numberOfDays: number;
  periodsPerSession: number;
  daysStartAt: number;
}

export interface Assignment {
  id: string;
  campusName: string;
  className: string;
  subjectName: string;
  teacherName: string;
  weeklyPeriods: number;
  isMainSubject: boolean;
  tag?: string;
  splitPattern: string;
  minDays: number;
  weight: number;
  consecutiveIfSameDay: boolean;
}

export interface BasicConstraints {
  teacherMaxGapsPerDayEnabled: boolean;
  teacherMaxGapsPerDay: number;
  studentsMaxGapsPerDayEnabled: boolean;
  studentsMaxGapsPerDay: number;
  homeroomTeachersAllRealDaysEnabled: boolean;
  teacherMinHoursDailyEnabled: boolean;
  teacherMinHoursDaily: number;
  teacherMinHoursDailySkipLowTotalTeachers: boolean;
  mainSubjectAfterFlagCeremonyEnabled: boolean;
  teacherMaxCampusChangesPerSessionEnabled: boolean;
  teacherMaxCampusChangesPerSession: number;
  teacherMinGapsBetweenCampusChangesEnabled: boolean;
  teacherMinGapsBetweenCampusChanges: number;
  teacherMaxCampusChangesPerRealDayEnabled: boolean;
  teacherMaxCampusChangesPerRealDay: number;
  teacherMaxCampusChangesPerWeekEnabled: boolean;
  teacherMaxCampusChangesPerWeek: number;
}

export interface TeacherUnavailableTimes {
  teacherName: string;
  slots: TimeSlot[];
}

export interface PreferredTimeConstraint {
  id: string;
  campusName: string;
  subjectName: string;
  className: string;
  teacherName: string;
  tag: string;
  dayLabel: string;
  periodIndex: number;
  weight: number;
  permanentlyLocked: boolean;
}

export interface TeacherWorkloadLimit {
  campusName?: string;
  teacherName: string;
  maxRealDays?: number;
  minRealDays?: number;
  maxSessions?: number;
  minSessions?: number;
  maxMornings?: number;
  maxAfternoons?: number;
  minMornings?: number;
  minAfternoons?: number;
  weight: number;
}

export interface SameTimeConstraint {
  id: string;
  name: string;
  assignmentIds: string[];
  weight: number;
}

export interface TimetableConstraints {
  basic: BasicConstraints;
  teacherUnavailableTimes: TeacherUnavailableTimes[];
  preferredTimes: PreferredTimeConstraint[];
  teacherWorkloadLimits: TeacherWorkloadLimit[];
  sameTimeGroups: SameTimeConstraint[];
}

export interface TimetableProject {
  settings: TimetableSettings;
  classes: SchoolClass[];
  subjects: Subject[];
  teachers: Teacher[];
  assignments: Assignment[];
  constraints: TimetableConstraints;
  subjectColors: Record<string, string>;
}

export interface FetCalendar {
  modeName: "Official" | "Mornings_Afternoons";
  dayNames: string[];
  realDayNames: string[];
  hourNames: string[];
  realHourNames: string[];
}

export interface FetActivity {
  id: number;
  assignmentId: string;
  campusName: string;
  className: string;
  subjectName: string;
  teacherName: string;
  tag: string;
  duration: number;
  totalDuration: number;
  groupId: number;
  splitIndex: number;
}

export interface FetBuildResult {
  xml: string;
  calendar: FetCalendar;
  activities: FetActivity[];
  assignmentActivityIds: Record<string, number[]>;
  warnings: string[];
  errors: string[];
}

export interface ScheduledActivity {
  id: number;
  dayLabel: string;
  periodIndex: number;
  room?: string;
}

export interface ScheduleCell {
  assignment?: Assignment;
  activity?: FetActivity;
}

export interface FetRunState {
  running: boolean;
  resultText: string;
  warningsText: string;
  errorsText: string;
  stdout: string;
  stderr: string;
  outputDir: string;
  scheduledActivities: ScheduledActivity[];
}
