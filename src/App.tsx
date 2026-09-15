import { Fragment, useEffect, useMemo, useState, type WheelEvent } from "react";
import {
  Download,
  FileDown,
  FileSpreadsheet,
  FolderOpen,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Upload
} from "lucide-react";
import { toPng } from "html-to-image";
import { buildFetFile } from "./core/fetSerializer";
import { parseActivitiesTimetable } from "./core/fetOutputParser";
import { createSampleProject } from "./core/sampleData";
import { defaultSplitPattern } from "./core/splitPattern";
import { buildCalendar, sameSlot, slotKey } from "./core/timeSlots";
import { makeId } from "./core/ids";
import type {
  Assignment,
  Campus,
  FetRunState,
  PreferredTimeConstraint,
  SameTimeConstraint,
  ScheduledActivity,
  SchoolClass,
  TeacherWorkloadLimit,
  TeacherUnavailableTimes,
  TimeSlot,
  TimetableProject
} from "./core/types";

type TabId = "setup" | "activities" | "constraints" | "stats" | "schedule";
type DataSubTab = "basic" | "pccm" | "pccm-check";
type ConstraintSubTab = "basic" | "teacher-busy" | "preferred-time" | "teacher-workload";
type StatsSubTab = "teacher-total" | "class-stats";
type SubTabTone = "rose" | "lemon" | "cyan" | "mint";
type PreviewMode = "class" | "teacher" | "school";
type ExcelCell = {
  value: string;
  fillColor?: string;
  bold?: boolean;
  fontSize?: number;
  rowSpan?: number;
  colSpan?: number;
  skip?: boolean;
};
type ExcelScheduleSection = {
  schoolName?: string;
  title: string;
  subtitleLeft?: string;
  subtitleRight?: string;
  columns: string[];
  rows: ExcelCell[][];
  columnWidths?: number[];
  rowHeight?: number;
};
type ExcelScheduleSheet = {
  sheetName: string;
  title: string;
  columns: string[];
  rows: ExcelCell[][];
  layout?: "schedule" | "matrix" | "stacked";
  sections?: ExcelScheduleSection[];
  columnWidths?: number[];
  rowHeight?: number;
  headerRowHeight?: number;
  titleFontSize?: number;
  schoolNameAlign?: "left" | "center";
};
type ExcelExportFile = {
  fileName: string;
  sheets: ExcelScheduleSheet[];
};
type StoredScheduleResult = {
  signature: string;
  sourceName: string;
  savedAt: string;
  scheduledActivities: ScheduledActivity[];
};

const STORAGE_KEY = "vietnam-primary-timetable-project-v1";
const SCHEDULE_STORAGE_KEY = "vietnam-primary-timetable-schedule-result-v1";
const PASTEL_PALETTE = [
  "#dff3e4",
  "#e4edff",
  "#fff1d8",
  "#fde8f2",
  "#e7f5f5",
  "#f3e9ff",
  "#f9ecdc",
  "#e4f6dc",
  "#fff7c7",
  "#e0f2fe",
  "#eeeeee",
  "#ffe0e0",
  "#eaf7d6",
  "#fce7f3",
  "#ede9fe",
  "#dcfce7"
];

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "setup", label: "Dữ liệu" },
  { id: "activities", label: "Các hoạt động" },
  { id: "constraints", label: "Ràng buộc" },
  { id: "stats", label: "Thống kê" },
  { id: "schedule", label: "Thời khóa biểu" }
];

const dataSubTabs: Array<{ id: DataSubTab; label: string; tone: SubTabTone }> = [
  { id: "basic", label: "Cơ bản", tone: "rose" },
  { id: "pccm", label: "PCCM", tone: "lemon" },
  { id: "pccm-check", label: "Bảng PCCM", tone: "cyan" }
];

const constraintSubTabs: Array<{ id: ConstraintSubTab; label: string; tone: SubTabTone }> = [
  { id: "basic", label: "Ràng buộc cơ bản", tone: "rose" },
  { id: "teacher-busy", label: "RB thời gian bận của giáo viên", tone: "lemon" },
  { id: "preferred-time", label: "RB thời gian ưu tiên", tone: "cyan" },
  { id: "teacher-workload", label: "RB số buổi đi của GV", tone: "mint" }
];

const statsSubTabs: Array<{ id: StatsSubTab; label: string; tone: SubTabTone }> = [
  { id: "teacher-total", label: "Tổng số tiết dạy của giáo viên", tone: "rose" },
  { id: "class-stats", label: "Thống kê theo lớp", tone: "cyan" }
];

export function App() {
  const [project, setProject] = useState<TimetableProject>(() => loadProject());
  const [activeTab, setActiveTab] = useState<TabId>("setup");
  const [dataSubTab, setDataSubTab] = useState<DataSubTab>("basic");
  const [constraintSubTab, setConstraintSubTab] = useState<ConstraintSubTab>("basic");
  const [selectedBasicCampus, setSelectedBasicCampus] = useState(project.settings.campuses[0]?.name || "");
  const [selectedPccmCampus, setSelectedPccmCampus] = useState(project.settings.campuses[0]?.name || "");
  const [selectedActivityCampus, setSelectedActivityCampus] = useState(project.settings.campuses[0]?.name || "");
  const [selectedConstraintCampus, setSelectedConstraintCampus] = useState(project.settings.campuses[0]?.name || "");
  const [selectedStatsCampus, setSelectedStatsCampus] = useState(project.settings.campuses[0]?.name || "");
  const [selectedScheduleCampus, setSelectedScheduleCampus] = useState(project.settings.campuses[0]?.name || "");
  const [selectedPccmClass, setSelectedPccmClass] = useState(project.classes[0]?.name || "");
  const [selectedActivityClass, setSelectedActivityClass] = useState(project.classes[0]?.name || "");
  const [fetClPath, setFetClPath] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState(project.teachers[0]?.name || "");
  const [dragBusy, setDragBusy] = useState<{ active: boolean; value: boolean }>({ active: false, value: false });
  const [preferredDraft, setPreferredDraft] = useState<PreferredTimeConstraint>(() => makePreferredDraft(project));
  const [previewMode, setPreviewMode] = useState<PreviewMode>("class");
  const [previewName, setPreviewName] = useState(project.classes[0]?.name || "");
  const [runState, setRunState] = useState<FetRunState>({
    running: false,
    resultText: "",
    warningsText: "",
    errorsText: "",
    stdout: "",
    stderr: "",
    outputDir: "",
    scheduledActivities: []
  });

  const build = useMemo(() => buildFetFile(project), [project]);
  const calendar = build.calendar;
  const scheduleSignature = useMemo(() => makeScheduleSignature(build.activities), [build.activities]);
  const campusNames = project.settings.campuses.map((campus) => campus.name);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }, [project]);

  useEffect(() => {
    const stored = loadStoredScheduleResult();
    if (!stored || stored.signature !== scheduleSignature || stored.scheduledActivities.length === 0) return;
    setRunState((current) => {
      if (current.scheduledActivities.length > 0) return current;
      return {
        ...current,
        resultText: `Đã khôi phục TKB đã tải trước đó (${stored.scheduledActivities.length} hoạt động).`,
        outputDir: stored.sourceName || "",
        scheduledActivities: stored.scheduledActivities
      };
    });
  }, [scheduleSignature]);

  useEffect(() => {
    if (runState.scheduledActivities.length === 0) return;
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({
      signature: scheduleSignature,
      sourceName: runState.outputDir,
      savedAt: new Date().toISOString(),
      scheduledActivities: runState.scheduledActivities
    }));
  }, [runState.scheduledActivities, runState.outputDir, scheduleSignature]);

  useEffect(() => {
    const currentConstraintTeachers = getCampusTeachers(project, selectedConstraintCampus);
    if (!selectedTeacher || (currentConstraintTeachers.length > 0 && !currentConstraintTeachers.includes(selectedTeacher))) {
      setSelectedTeacher(currentConstraintTeachers[0] || "");
    }
  }, [project, selectedConstraintCampus, selectedTeacher]);

  useEffect(() => {
    const firstCampus = campusNames[0] || "";
    const campusSet = new Set(campusNames);
    const campusSetters: Array<[string, (value: string) => void]> = [
      [selectedBasicCampus, setSelectedBasicCampus],
      [selectedPccmCampus, setSelectedPccmCampus],
      [selectedActivityCampus, setSelectedActivityCampus],
      [selectedConstraintCampus, setSelectedConstraintCampus],
      [selectedStatsCampus, setSelectedStatsCampus],
      [selectedScheduleCampus, setSelectedScheduleCampus]
    ];
    campusSetters.forEach(([value, setter]) => {
      if (!value || !campusSet.has(value)) setter(firstCampus);
    });
  }, [campusNames, selectedBasicCampus, selectedPccmCampus, selectedActivityCampus, selectedConstraintCampus, selectedStatsCampus, selectedScheduleCampus]);

  useEffect(() => {
    const pccmClassNames = getCampusClasses(project, selectedPccmCampus).map((schoolClass) => schoolClass.name);
    if (!selectedPccmClass || !pccmClassNames.includes(selectedPccmClass)) {
      setSelectedPccmClass(pccmClassNames[0] || "");
    }
    const activityClassNames = getCampusClasses(project, selectedActivityCampus).map((schoolClass) => schoolClass.name);
    if (!selectedActivityClass || !activityClassNames.includes(selectedActivityClass)) {
      setSelectedActivityClass(activityClassNames[0] || "");
    }
  }, [project, selectedPccmCampus, selectedActivityCampus, selectedPccmClass, selectedActivityClass]);

  useEffect(() => {
    setPreferredDraft((draft) => ({ ...draft, campusName: selectedConstraintCampus }));
  }, [selectedConstraintCampus]);

  const teachers = unique(project.teachers.map((teacher) => teacher.name));
  const classes = unique(project.classes.map((schoolClass) => schoolClass.name));
  const basicClasses = getCampusClasses(project, selectedBasicCampus).map((schoolClass) => schoolClass.name);
  const basicTeachers = getCampusTeachers(project, selectedBasicCampus);
  const constraintTeachers = getCampusTeachers(project, selectedConstraintCampus);
  const scheduleClasses = getCampusClasses(project, selectedScheduleCampus).map((schoolClass) => schoolClass.name);
  const scheduleTeachers = getCampusTeachers(project, selectedScheduleCampus);
  const subjects = project.subjects.map((subject) => subject.name);
  const tags = unique(project.assignments.map((assignment) => assignment.tag || "").filter(Boolean));

  const activityById = useMemo(() => new Map(build.activities.map((activity) => [activity.id, activity])), [build.activities]);
  const assignmentById = useMemo(() => new Map(project.assignments.map((assignment) => [assignment.id, assignment])), [project.assignments]);
  const scheduledById = useMemo(() => new Map(runState.scheduledActivities.map((item) => [item.id, item])), [runState.scheduledActivities]);

  function patchProject(updater: (draft: TimetableProject) => TimetableProject) {
    setProject((current) => updater(structuredClone(current)));
  }

  function updateNames(kind: "campuses" | "classes" | "subjects" | "teachers", raw: string, campusName = selectedBasicCampus) {
    const names = parseNameList(raw);
    patchProject((draft) => {
      if (kind === "campuses") {
        const previousCampuses = new Set(project.settings.campuses.map((campus) => campus.name));
        const nextCampuses = names.length > 0 ? names : [project.settings.institutionName || "Trường Tiểu Học"];
        draft.settings.campuses = nextCampuses.map((name) => {
          const existing = project.settings.campuses.find((campus) => campus.name === name);
          return existing || { id: name, name };
        });
        draft.settings.institutionName = nextCampuses.join(" + ");
        const campusSet = new Set(nextCampuses);
        draft.classes = draft.classes.filter((schoolClass) => campusSet.has(schoolClass.campusName));
        draft.assignments = draft.assignments.filter((assignment) => campusSet.has(assignment.campusName));
        draft.teachers = draft.teachers
          .map((teacher) => ({
            ...teacher,
            campusNames: unique((teacher.campusNames || []).filter((item) => campusSet.has(item)))
          }))
          .filter((teacher) => teacher.campusNames.length > 0 || draft.assignments.some((assignment) => assignment.teacherName === teacher.name));
        draft.constraints.preferredTimes = draft.constraints.preferredTimes.filter((constraint) => !constraint.campusName || campusSet.has(constraint.campusName));
        if (previousCampuses.size === 1 && draft.classes.length === 0) {
          draft.classes = project.classes.map((schoolClass) => ({ ...schoolClass, campusName: nextCampuses[0], id: `${nextCampuses[0]}-${schoolClass.name}` }));
          draft.assignments = project.assignments.map((assignment) => ({ ...assignment, campusName: nextCampuses[0] }));
        }
      }
      if (kind === "classes") {
        const existingInCampus = project.classes.filter((schoolClass) => schoolClass.campusName === campusName);
        const otherClasses = draft.classes.filter((schoolClass) => schoolClass.campusName !== campusName);
        draft.classes = [
          ...otherClasses,
          ...names.map((name) => {
          const existing = existingInCampus.find((schoolClass) => schoolClass.name === name);
          return {
            id: existing?.id || `${campusName}-${name}`,
            name,
            campusName,
            studentCount: existing?.studentCount,
            homeroomTeacherName: existing?.homeroomTeacherName || inferHomeroomTeacher(project.assignments, campusName, name)
          };
        })];
        draft.assignments = draft.assignments.filter((assignment) => assignment.campusName !== campusName || names.includes(assignment.className));
        const assignmentIds = new Set(draft.assignments.map((assignment) => assignment.id));
        draft.constraints.preferredTimes = draft.constraints.preferredTimes.filter((constraint) => constraint.campusName !== campusName || !constraint.className || names.includes(constraint.className));
        draft.constraints.sameTimeGroups.forEach((group) => {
          group.assignmentIds = group.assignmentIds.filter((assignmentId) => assignmentIds.has(assignmentId));
        });
        draft.constraints.sameTimeGroups = draft.constraints.sameTimeGroups.filter((group) => group.assignmentIds.length > 0);
      }
      if (kind === "subjects") draft.subjects = names.map((name) => ({ id: name, name }));
      if (kind === "teachers") {
        const listed = new Set(names);
        const known = new Map(draft.teachers.map((teacher) => [teacher.name, teacher]));
        for (const teacher of draft.teachers) {
          teacher.campusNames = unique((teacher.campusNames || []).filter((item) => item !== campusName));
        }
        for (const name of names) {
          const existing = known.get(name);
          if (existing) {
            existing.campusNames = unique([...(existing.campusNames || []), campusName]);
          } else {
            draft.teachers.push({ id: name, name, campusNames: [campusName], morningsAfternoonsBehavior: "Unrestricted" });
          }
        }
        draft.teachers = draft.teachers.filter((teacher) => {
          if ((teacher.campusNames || []).length > 0) return true;
          if (listed.has(teacher.name)) return true;
          return draft.assignments.some((assignment) => assignment.teacherName === teacher.name)
            || draft.classes.some((schoolClass) => schoolClass.homeroomTeacherName === teacher.name);
        });
      }
      const teacherSet = new Set(getTeacherCampusMap(draft).keys());
      draft.constraints.teacherWorkloadLimits = (draft.constraints.teacherWorkloadLimits || [])
        .filter((constraint) => teacherSet.has(constraint.teacherName));
      draft.constraints.teacherWorkloadLimits = mergeTeacherWorkloadLimits(draft.constraints.teacherWorkloadLimits);
      return draft;
    });
  }

  function patchSchoolClass(id: string, patch: Partial<SchoolClass>) {
    patchProject((draft) => {
      const schoolClass = draft.classes.find((item) => item.id === id);
      if (!schoolClass) return draft;
      Object.assign(schoolClass, patch);
      return draft;
    });
  }

  function addAssignment() {
    const campusName = campusNames[0] || "";
    const className = getCampusClasses(project, campusName)[0]?.name || classes[0] || "1A";
    const subjectName = subjects[0] || "Tiếng Việt";
    const teacherName = teachers[0] || "";
    const weeklyPeriods = 1;
    patchProject((draft) => {
      draft.assignments.push({
        id: makeId("asg"),
        campusName,
        className,
        subjectName,
        teacherName,
        weeklyPeriods,
        isMainSubject: isDefaultMainSubject(subjectName),
        tag: "",
        splitPattern: defaultSplitPattern(weeklyPeriods, draft.settings.periodsPerSession, draft.settings.numberOfDays),
        minDays: 0,
        weight: 1,
        consecutiveIfSameDay: true
      });
      return draft;
    });
  }

  function addAssignmentForClass(campusName: string, className: string) {
    if (!campusName || !className) return;
    const subjectName = "";
    const teacherName = "";
    const weeklyPeriods = 1;
    patchProject((draft) => {
      draft.assignments.push({
        id: makeId("asg"),
        campusName,
        className,
        subjectName,
        teacherName,
        weeklyPeriods,
        isMainSubject: false,
        tag: "",
        splitPattern: defaultSplitPattern(weeklyPeriods, draft.settings.periodsPerSession, draft.settings.numberOfDays),
        minDays: 0,
        weight: 1,
        consecutiveIfSameDay: true
      });
      return draft;
    });
  }

  function patchAssignment(id: string, patch: Partial<Assignment>) {
    patchProject((draft) => {
      const assignment = draft.assignments.find((item) => item.id === id);
      if (!assignment) return draft;
      Object.assign(assignment, patch);
      if (patch.weeklyPeriods !== undefined && !patch.splitPattern) {
        assignment.splitPattern = defaultSplitPattern(
          assignment.weeklyPeriods,
          draft.settings.periodsPerSession,
          draft.settings.numberOfDays
        );
        assignment.minDays = assignment.weeklyPeriods > 1 ? 1 : 0;
      }
      if (patch.subjectName && !draft.subjectColors[patch.subjectName]) {
        draft.subjectColors[patch.subjectName] = PASTEL_PALETTE[Object.keys(draft.subjectColors).length % PASTEL_PALETTE.length];
      }
      if (patch.subjectName !== undefined && patch.isMainSubject === undefined) {
        assignment.isMainSubject = isDefaultMainSubject(patch.subjectName);
      }
      return draft;
    });
  }

  function deleteAssignment(id: string) {
    patchProject((draft) => {
      draft.assignments = draft.assignments.filter((assignment) => assignment.id !== id);
      draft.constraints.sameTimeGroups.forEach((group) => {
        group.assignmentIds = group.assignmentIds.filter((assignmentId) => assignmentId !== id);
      });
      return draft;
    });
  }

  function toggleUnavailableSlot(teacherName: string, slot: TimeSlot, forceValue?: boolean) {
    patchProject((draft) => {
      let item = draft.constraints.teacherUnavailableTimes.find((entry) => entry.teacherName === teacherName);
      if (!item) {
        item = { teacherName, slots: [] };
        draft.constraints.teacherUnavailableTimes.push(item);
      }
      const exists = item.slots.some((current) => sameSlot(current, slot));
      const nextValue = forceValue ?? !exists;
      item.slots = nextValue
        ? uniqueSlots([...item.slots, slot])
        : item.slots.filter((current) => !sameSlot(current, slot));
      return draft;
    });
  }

  function addPreferredTime() {
    patchProject((draft) => {
      draft.constraints.preferredTimes.push({ ...preferredDraft, id: makeId("pref") });
      return draft;
    });
    setPreferredDraft({ ...makePreferredDraft(project), campusName: selectedConstraintCampus });
  }

  function removeConstraint(kind: "preferred" | "same", id: string) {
    patchProject((draft) => {
      if (kind === "preferred") draft.constraints.preferredTimes = draft.constraints.preferredTimes.filter((item) => item.id !== id);
      if (kind === "same") draft.constraints.sameTimeGroups = draft.constraints.sameTimeGroups.filter((item) => item.id !== id);
      return draft;
    });
  }

  function patchTeacherWorkloadLimit(teacherName: string, patch: Partial<TeacherWorkloadLimit>) {
    patchProject((draft) => {
      const limits = draft.constraints.teacherWorkloadLimits;
      const index = limits.findIndex((item) => item.teacherName === teacherName);
      const current = index >= 0 ? limits[index] : { teacherName, weight: 1 };
      const next = { ...current, ...patch, teacherName };
      delete next.campusName;
      const hasAnyLimit = [
        next.maxRealDays,
        next.minRealDays,
        next.maxSessions,
        next.minSessions,
        next.maxMornings,
        next.maxAfternoons,
        next.minMornings,
        next.minAfternoons
      ]
        .some((value) => value !== undefined);

      if (!hasAnyLimit) {
        if (index >= 0) limits.splice(index, 1);
        return draft;
      }

      next.weight = Number.isFinite(next.weight) ? next.weight : 1;
      if (index >= 0) limits[index] = next;
      else limits.push(next);
      return draft;
    });
  }

  function autoColorSubjects() {
    patchProject((draft) => {
      unique([...draft.subjects.map((subject) => subject.name), ...draft.assignments.map((assignment) => assignment.subjectName)])
        .forEach((subject, index) => {
          draft.subjectColors[subject] = PASTEL_PALETTE[index % PASTEL_PALETTE.length];
        });
      return draft;
    });
  }

  async function saveFet() {
    if (build.errors.length > 0) return;
    await saveText("du-lieu-tkb.fet", build.xml, [{ name: "FET", extensions: ["fet"] }]);
  }

  async function saveProject() {
    await saveText("du-lieu-tkb.json", JSON.stringify(project, null, 2), [{ name: "Timetable JSON", extensions: ["json"] }]);
  }

  async function openProject() {
    if (!window.timetableDesktop) return;
    const result = await window.timetableDesktop.openJsonFile();
    if (result.ok && result.content) {
      setProject(migrateProject(JSON.parse(result.content) as Partial<TimetableProject>));
    }
  }

  async function runFet() {
    if (build.errors.length > 0) return;
    setRunState((current) => ({ ...current, running: true, resultText: "", warningsText: "", errorsText: "" }));
    const runner = window.timetableDesktop;
    if (!runner) {
      setRunState((current) => ({
        ...current,
        running: false,
        errorsText: "Chạy FET chỉ có trong bản desktop Electron. Trên browser hãy dùng nút xuất .fet."
      }));
      return;
    }

    const result = await runner.runFetCl({ xml: build.xml, fetClPath, timeLimitSeconds: 300 });
    if (result.fetClPath) setFetClPath(result.fetClPath);
    let scheduledActivities: ScheduledActivity[] = [];
    try {
      scheduledActivities = result.activitiesXml ? parseActivitiesTimetable(result.activitiesXml) : [];
    } catch (error) {
      result.errorsText = `${result.errorsText || ""}\n${error instanceof Error ? error.message : String(error)}`;
    }
    setRunState({
      running: false,
      resultText: result.resultText || "",
      warningsText: result.warningsText || "",
      errorsText: result.ok ? (result.errorsText || "") : (result.error || result.errorsText || result.stderr || "FET chưa trả về kết quả."),
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      outputDir: result.outputDir || "",
      scheduledActivities
    });
    if (scheduledActivities.length > 0) setActiveTab("schedule");
  }

  async function loadTimetableResult() {
    const selectedFile = await pickLocalTextFile(".xml,text/xml,application/xml");
    if (!selectedFile) return;
    applyTimetableResult(selectedFile.content, selectedFile.name);
  }

  function applyTimetableResult(xml: string, sourceName: string) {
    try {
      const scheduledActivities = parseActivitiesTimetable(xml);
      if (scheduledActivities.length === 0) {
        throw new Error("File này chưa có hoạt động đã xếp. Hãy chọn file *_activities.xml trong thư mục output của FET.");
      }

      const matchedCount = scheduledActivities.filter((item) => activityById.has(item.id)).length;
      if (matchedCount === 0) {
        throw new Error("File TKB không khớp dữ liệu PCCM hiện tại. Hãy dùng đúng file *_activities.xml được sinh từ file .fet của dự án này.");
      }

      const unmatchedCount = scheduledActivities.length - matchedCount;
      setRunState({
        running: false,
        resultText: `Đã tải TKB từ ${sourceName}. Khớp ${matchedCount}/${scheduledActivities.length} hoạt động.`,
        warningsText: unmatchedCount > 0 ? `Có ${unmatchedCount} hoạt động trong file TKB không khớp dữ liệu hiện tại nên sẽ không hiển thị.` : "",
        errorsText: "",
        stdout: "",
        stderr: "",
        outputDir: sourceName,
        scheduledActivities
      });
      setActiveTab("schedule");
    } catch (error) {
      setRunState((current) => ({
        ...current,
        running: false,
        resultText: "",
        warningsText: "",
        errorsText: error instanceof Error ? error.message : String(error),
        stdout: "",
        stderr: "",
        outputDir: sourceName,
        scheduledActivities: []
      }));
      setActiveTab("schedule");
    }
  }

  async function selectFetCl() {
    const runner = window.timetableDesktop;
    if (!runner) return;
    const result = await runner.selectFetCl();
    if (result.ok && result.filePath) setFetClPath(result.filePath);
  }

  async function locateFetCl() {
    const runner = window.timetableDesktop;
    if (!runner) return;
    const result = await runner.locateFetCl();
    if (result.ok && result.filePath) setFetClPath(result.filePath);
  }

  async function saveText(defaultPath: string, content: string, filters: Array<{ name: string; extensions: string[] }>) {
    if (window.timetableDesktop) {
      await window.timetableDesktop.saveTextFile({ defaultPath, content, filters });
      return;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = defaultPath;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportPng(targetId: string, filename: string) {
    const node = document.getElementById(targetId);
    if (!node) return;
    const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff" });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }

  async function exportExcel() {
    if (scheduledById.size === 0) {
      setRunState((current) => ({
        ...current,
        errorsText: "Chưa có kết quả FET để xuất Excel. Hãy chạy FET hoặc tải TKB trước.",
        resultText: "",
        warningsText: ""
      }));
      setActiveTab("schedule");
      return;
    }

    const exporter = window.timetableDesktop?.exportExcelFiles;
    if (!exporter) {
      setRunState((current) => ({
        ...current,
        errorsText: "Xuất Excel theo folder chỉ có trong bản desktop.",
        resultText: "",
        warningsText: ""
      }));
      return;
    }

    const payload = buildExcelExportPayload({
      project,
      mode: previewMode,
      campusName: selectedScheduleCampus,
      classes: scheduleClasses,
      teachers: scheduleTeachers,
      calendar,
      assignments: project.assignments,
      activities: build.activities,
      activityById,
      scheduledById,
      subjectColors: project.subjectColors
    });
    const result = await exporter(payload);
    if (result.canceled) return;

    setRunState((current) => ({
      ...current,
      errorsText: result.ok ? "" : result.error || "Không xuất được Excel.",
      resultText: result.ok ? `Đã xuất Excel: ${result.folderPath || result.filePath || ""}` : "",
      warningsText: ""
    }));
  }

  return (
    <div className="app" onMouseUp={() => setDragBusy({ active: false, value: false })}>
      <header className="topbar">
        <div className="author-block">
          <h1>Tác giả</h1>
          <span>Khúc Ngọc Nam - Khoa học Dữ liệu và Trí tuệ nhân tạo 03 K68 - Đại học Bách khoa Hà Nội</span>
          <span>SĐT: 0963 417 453 - Email: khucnam195@gmail.com</span>
        </div>
        <div className="toolbar">
          <button type="button" onClick={saveProject} title="Lưu dữ liệu JSON">
            <Save size={18} /> Lưu
          </button>
          <button type="button" onClick={openProject} title="Mở dữ liệu JSON">
            <FolderOpen size={18} /> Mở
          </button>
          <button type="button" onClick={saveFet} disabled={build.errors.length > 0} title="Xuất file .fet">
            <FileDown size={18} /> .fet
          </button>
          <button type="button" onClick={runFet} disabled={build.errors.length > 0 || runState.running} title="Chạy fet-cl.exe">
            {runState.running ? <RefreshCw size={18} className="spin" /> : <Play size={18} />} Chạy FET
          </button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main>
        <StatusPanel kind="positive" errors={build.errors} warnings={build.warnings} runState={runState} />

        {activeTab === "setup" && (
          <section className="data-shell">
            <div className="data-subtabs">
              {dataSubTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`data-subtab ${tab.tone} ${dataSubTab === tab.id ? "active" : ""}`}
                  onClick={() => setDataSubTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {dataSubTab === "basic" && (
              <div className="layout two-cols">
            <div className="panel">
              <div className="panel-title">
                <Settings size={18} />
                <h2>Thông tin nhà trường</h2>
              </div>
              <div className="form-grid">                <label>
                  Các trường
                  <NamesTextarea names={campusNames} onChange={(value) => updateNames("campuses", value)} />
                </label>
                <label>
                  Kiểu thời khóa biểu
                  <select
                    value={project.settings.mode}
                    onChange={(event) => patchProject((draft) => {
                      draft.settings.mode = event.target.value as TimetableProject["settings"]["mode"];
                      return draft;
                    })}
                  >
                    <option value="single-session">Theo ngày / một buổi</option>
                    <option value="full-day">Cả ngày sáng / chiều</option>
                  </select>
                </label>
                <label>
                  Số ngày
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={project.settings.numberOfDays}
                    onChange={(event) => patchProject((draft) => {
                      draft.settings.numberOfDays = Number(event.target.value);
                      return draft;
                    })}
                  />
                </label>
                <label>
                  Tiết tối đa mỗi buổi
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={project.settings.periodsPerSession}
                    onChange={(event) => patchProject((draft) => {
                      draft.settings.periodsPerSession = Number(event.target.value);
                      draft.assignments.forEach((assignment) => {
                        assignment.splitPattern = defaultSplitPattern(
                          assignment.weeklyPeriods,
                          draft.settings.periodsPerSession,
                          draft.settings.numberOfDays
                        );
                      });
                      return draft;
                    })}
                  />
                </label>
              </div>
              <div className="session-strip">
                {calendar.dayNames.map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="path-row">
                <input value={fetClPath} onChange={(event) => setFetClPath(event.target.value)} placeholder="fet-cl.exe" />
                <button type="button" onClick={locateFetCl} title="Tự tìm fet-cl.exe">
                  <RefreshCw size={17} />
                </button>
                <button type="button" onClick={selectFetCl} title="Chọn fet-cl.exe">
                  <Upload size={17} />
                </button>
              </div>
            </div>

            <div className="panel">
              <div className="panel-title">
                <h2>Thông tin cơ bản</h2>
              </div>
              <CampusTabs campuses={campusNames} selectedCampus={selectedBasicCampus} setSelectedCampus={setSelectedBasicCampus} />
              <p className="panel-guide">Giáo viên có cùng tên ở nhiều điểm trường sẽ được hiểu là cùng một người. Nếu là hai người khác nhau, hãy nhập tên phân biệt hơn.</p>
              <div className="textarea-grid">
                <label>
                  Lớp
                  <NamesTextarea names={basicClasses} onChange={(value) => updateNames("classes", value, selectedBasicCampus)} />
                </label>
                <label>
                  Môn
                  <NamesTextarea names={subjects} onChange={(value) => updateNames("subjects", value)} />
                </label>
                <label>
                  Giáo viên
                  <NamesTextarea names={basicTeachers} onChange={(value) => updateNames("teachers", value, selectedBasicCampus)} />
                </label>
              </div>
            </div>

            <MultiCampusTeachersPanel project={project} />

            <div className="panel wide">
              <div className="panel-title">
                <h2>Giáo viên chủ nhiệm</h2>
              </div>
              <CampusTabs campuses={campusNames} selectedCampus={selectedBasicCampus} setSelectedCampus={setSelectedBasicCampus} />
              <div className="table-wrap">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Lớp</th>
                      <th>GVCN</th>
                      <th>Sĩ số</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getCampusClasses(project, selectedBasicCampus).map((schoolClass) => (
                      <tr key={schoolClass.id}>
                        <td>{schoolClass.name}</td>
                        <td>
                          <DataInput
                            list="teachers-list"
                            value={schoolClass.homeroomTeacherName || ""}
                            onChange={(value) => patchSchoolClass(schoolClass.id, { homeroomTeacherName: value })}
                            fallback={basicTeachers}
                          />
                        </td>
                        <td>
                          <input
                            className="small-input"
                            type="number"
                            min={0}
                            value={schoolClass.studentCount || 0}
                            onChange={(event) => patchSchoolClass(schoolClass.id, { studentCount: Number(event.target.value) })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
              </div>
            )}

            {dataSubTab === "pccm" && (
            <div className="panel wide">
              <div className="panel-title">
                <h2>Phân công chuyên môn</h2>
              </div>
              <PccmClassEditor
                project={project}
                selectedCampusName={selectedPccmCampus}
                setSelectedCampusName={setSelectedPccmCampus}
                selectedClassName={selectedPccmClass}
                setSelectedClassName={setSelectedPccmClass}
                subjects={subjects}
                teachers={getCampusTeachers(project, selectedPccmCampus)}
                patchAssignment={patchAssignment}
                deleteAssignment={deleteAssignment}
                addSubject={() => addAssignmentForClass(selectedPccmCampus, selectedPccmClass)}
              />
            </div>
            )}

            {dataSubTab === "pccm-check" && (
            <div className="panel wide">
              <div className="panel-title">
                <h2>Bảng PCCM</h2>
              </div>
              <p className="panel-guide">Kiểm tra lại PCCM, nếu cần sửa hãy quay lại mục PCCM.</p>
              <CampusTabs campuses={campusNames} selectedCampus={selectedPccmCampus} setSelectedCampus={setSelectedPccmCampus} />
              <PccmTable project={project} subjects={subjects} campusName={selectedPccmCampus} />
            </div>
            )}
          </section>
        )}

        {activeTab === "activities" && (
          <section className="panel">
            <div className="panel-title">
              <h2>Các hoạt động</h2>
              <button type="button" onClick={autoColorSubjects}>
                <Palette size={17} /> Tô màu
              </button>
            </div>
            <ActivitiesTable
              project={project}
              selectedCampusName={selectedActivityCampus}
              setSelectedCampusName={setSelectedActivityCampus}
              selectedClassName={selectedActivityClass}
              setSelectedClassName={setSelectedActivityClass}
              patchAssignment={patchAssignment}
              patchProject={patchProject}
            />
          </section>
        )}

        {activeTab === "constraints" && (
          <section className="data-shell constraint-shell">
            <div className="data-subtabs constraint-subtabs" role="tablist" aria-label="Các mục ràng buộc">
              {constraintSubTabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  className={`data-subtab constraint-subtab ${tab.tone} ${constraintSubTab === tab.id ? "active" : ""}`}
                  onClick={() => setConstraintSubTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {constraintSubTab === "basic" && (
              <div className="panel">
                <div className="panel-title">
                  <h2>Ràng buộc cơ bản</h2>
                </div>
                <div className="form-grid">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={project.constraints.basic.teacherMaxGapsPerDayEnabled}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMaxGapsPerDayEnabled = event.target.checked;
                        return draft;
                      })}
                    />
                    Số tiết trống tối đa mỗi buổi của 1 giáo viên
                  </label>
                  <label>
                    Max gaps GV
                    <input
                      type="number"
                      min={0}
                      value={project.constraints.basic.teacherMaxGapsPerDay}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMaxGapsPerDay = Number(event.target.value);
                        return draft;
                      })}
                    />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={project.constraints.basic.studentsMaxGapsPerDayEnabled}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.studentsMaxGapsPerDayEnabled = event.target.checked;
                        return draft;
                      })}
                    />
                    Số tiết trống tối đa mỗi buổi của 1 lớp
                  </label>
                  <label>
                    Max gaps lớp
                    <input
                      type="number"
                      min={0}
                      value={project.constraints.basic.studentsMaxGapsPerDay}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.studentsMaxGapsPerDay = Number(event.target.value);
                        return draft;
                      })}
                    />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={project.constraints.basic.homeroomTeachersAllRealDaysEnabled}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.homeroomTeachersAllRealDaysEnabled = event.target.checked;
                        return draft;
                      })}
                    />
                    GVCN đi đủ ngày thật
                  </label>
                  <label>
                    Số ngày thật
                    <input type="number" value={project.settings.numberOfDays} disabled />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={project.constraints.basic.teacherMinHoursDailyEnabled}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMinHoursDailyEnabled = event.target.checked;
                        return draft;
                      })}
                    />
                    Số tiết tối thiểu mỗi buổi của 1 giáo viên
                  </label>
                  <label>
                    Tối thiểu tiết/buổi
                    <input
                      type="number"
                      min={1}
                      value={project.constraints.basic.teacherMinHoursDaily}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMinHoursDaily = Number(event.target.value);
                        return draft;
                      })}
                    />
                  </label>
                  <label className="check-row form-span">
                    <input
                      type="checkbox"
                      checked={project.constraints.basic.teacherMinHoursDailySkipLowTotalTeachers}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMinHoursDailySkipLowTotalTeachers = event.target.checked;
                        return draft;
                      })}
                    />
                    Tự bỏ qua GV có tổng tiết/tuần nhỏ hơn mức tối thiểu
                  </label>
                <label className="check-row form-span">
                  <input
                    type="checkbox"
                    checked={project.constraints.basic.mainSubjectAfterFlagCeremonyEnabled}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.mainSubjectAfterFlagCeremonyEnabled = event.target.checked;
                        return draft;
                      })}
                  />
                  Sau tiết chào cờ bắt buộc học môn chính
                </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={project.constraints.basic.teacherMaxCampusChangesPerSessionEnabled}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMaxCampusChangesPerSessionEnabled = event.target.checked;
                        return draft;
                      })}
                    />
                    Giới hạn đổi điểm trường trong cùng buổi
                  </label>
                  <label>
                    Số lần đổi tối đa/buổi
                    <input
                      type="number"
                      min={0}
                      value={project.constraints.basic.teacherMaxCampusChangesPerSession}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMaxCampusChangesPerSession = Number(event.target.value);
                        return draft;
                      })}
                    />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={project.constraints.basic.teacherMinGapsBetweenCampusChangesEnabled}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMinGapsBetweenCampusChangesEnabled = event.target.checked;
                        return draft;
                      })}
                    />
                    Cách tiết tối thiểu khi đổi điểm trường
                  </label>
                  <label>
                    Số tiết trống tối thiểu
                    <input
                      type="number"
                      min={0}
                      value={project.constraints.basic.teacherMinGapsBetweenCampusChanges}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMinGapsBetweenCampusChanges = Number(event.target.value);
                        return draft;
                      })}
                    />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={project.constraints.basic.teacherMaxCampusChangesPerRealDayEnabled}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMaxCampusChangesPerRealDayEnabled = event.target.checked;
                        return draft;
                      })}
                    />
                    Giới hạn đổi điểm trường trong ngày thật
                  </label>
                  <label>
                    Số lần đổi tối đa/ngày thật
                    <input
                      type="number"
                      min={0}
                      value={project.constraints.basic.teacherMaxCampusChangesPerRealDay}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMaxCampusChangesPerRealDay = Number(event.target.value);
                        return draft;
                      })}
                    />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={project.constraints.basic.teacherMaxCampusChangesPerWeekEnabled}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMaxCampusChangesPerWeekEnabled = event.target.checked;
                        return draft;
                      })}
                    />
                    Giới hạn đổi điểm trường trong tuần
                  </label>
                  <label>
                    Số lần đổi tối đa/tuần
                    <input
                      type="number"
                      min={0}
                      value={project.constraints.basic.teacherMaxCampusChangesPerWeek}
                      onChange={(event) => patchProject((draft) => {
                        draft.constraints.basic.teacherMaxCampusChangesPerWeek = Number(event.target.value);
                        return draft;
                      })}
                    />
                  </label>
                </div>
                <div className="constraint-map">
                  <span>ConstraintBasicCompulsoryTime</span>
                  <span>ConstraintBasicCompulsorySpace</span>
                  <span>ConstraintTeachersMaxGapsPerDay</span>
                  <span>ConstraintStudentsMaxGapsPerDay</span>
                  <span>ConstraintTeacherMinRealDaysPerWeek</span>
                  <span>ConstraintTeacherMinHoursDaily</span>
                  <span>ConstraintActivitiesOccupyMinTimeSlotsFromSelection</span>
                  <span>ConstraintTeachersMaxBuildingChangesPerDay</span>
                  <span>ConstraintTeachersMinGapsBetweenBuildingChanges</span>
                  <span>ConstraintTeachersMaxBuildingChangesPerRealDay</span>
                  <span>ConstraintTeachersMaxBuildingChangesPerWeek</span>
                  <span>ConstraintTeacherMaxRealDaysPerWeek</span>
                  <span>ConstraintTeacherMinRealDaysPerWeek</span>
                  <span>ConstraintTeacherMaxDaysPerWeek</span>
                  <span>ConstraintTeacherMinDaysPerWeek</span>
                </div>
              </div>
            )}

            {constraintSubTab === "teacher-busy" && (
              <div className="panel">
                <div className="panel-title">
                  <h2>RB thời gian bận của giáo viên</h2>
                  <div className="busy-legend" aria-label="Chú thích màu thời gian bận">
                    <span><i className="busy-legend-swatch busy"></i>Bận</span>
                    <span><i className="busy-legend-swatch free"></i>Không bận</span>
                  </div>
                </div>
                <CampusTabs campuses={campusNames} selectedCampus={selectedConstraintCampus} setSelectedCampus={setSelectedConstraintCampus} />
                {constraintTeachers.length > 0 ? (
                  <div className="busy-editor-layout">
                    <TeacherBusyList
                      teachers={constraintTeachers}
                      selectedTeacher={selectedTeacher}
                      setSelectedTeacher={setSelectedTeacher}
                    />
                    <BusyGrid
                      calendar={calendar}
                      selectedTeacher={selectedTeacher}
                      unavailable={project.constraints.teacherUnavailableTimes}
                      dragBusy={dragBusy}
                      setDragBusy={setDragBusy}
                      toggleUnavailableSlot={toggleUnavailableSlot}
                    />
                  </div>
                ) : (
                  <div className="empty-result">Chưa có giáo viên nào trong điểm trường này.</div>
                )}
              </div>
            )}

            {constraintSubTab === "preferred-time" && (
              <div className="panel">
                <div className="panel-title">
                  <h2>RB thời gian ưu tiên</h2>
                  <button type="button" onClick={addPreferredTime}>
                    <Plus size={17} /> Thêm
                  </button>
                </div>
                <CampusTabs campuses={campusNames} selectedCampus={selectedConstraintCampus} setSelectedCampus={setSelectedConstraintCampus} />
                <PreferredEditor
                  draft={preferredDraft}
                  setDraft={setPreferredDraft}
                  classes={getCampusClasses(project, selectedConstraintCampus).map((schoolClass) => schoolClass.name)}
                  subjects={subjects}
                  teachers={constraintTeachers}
                  tags={tags}
                  calendar={calendar}
                />
                <ConstraintRows
                  preferredTimes={project.constraints.preferredTimes}
                  sameTimeGroups={[]}
                  assignmentById={assignmentById}
                  removeConstraint={removeConstraint}
                />
              </div>
            )}

            {constraintSubTab === "teacher-workload" && (
              <TeacherWorkloadPanel
                project={project}
                calendarDayCount={calendar.dayNames.length}
                selectedCampus={selectedConstraintCampus}
                setSelectedCampus={setSelectedConstraintCampus}
                campusNames={campusNames}
                teachers={constraintTeachers}
                patchLimit={patchTeacherWorkloadLimit}
              />
            )}

          </section>
        )}

        {activeTab === "stats" && (
          <StatsPanel project={project} selectedCampus={selectedStatsCampus} setSelectedCampus={setSelectedStatsCampus} />
        )}

        {activeTab === "schedule" && (
          <section className="panel">
            <div className="panel-title">
              <h2>Thời khóa biểu</h2>
              <div className="toolbar inline">
                <select value={selectedScheduleCampus} onChange={(event) => {
                  const nextCampus = event.target.value;
                  setSelectedScheduleCampus(nextCampus);
                  const campusClassNames = getCampusClasses(project, nextCampus).map((schoolClass) => schoolClass.name);
                  const campusTeacherNames = getCampusTeachers(project, nextCampus);
                  setPreviewName(previewMode === "teacher" ? campusTeacherNames[0] || "" : campusClassNames[0] || "");
                }}>
                  {campusNames.map((campus) => <option key={campus} value={campus}>{campus}</option>)}
                </select>
                <select value={previewMode} onChange={(event) => {
                  const nextMode = event.target.value as PreviewMode;
                  setPreviewMode(nextMode);
                  setPreviewName(nextMode === "teacher" ? scheduleTeachers[0] || "" : scheduleClasses[0] || "");
                }}>
                  <option value="class">Từng lớp</option>
                  <option value="teacher">Từng giáo viên</option>
                  <option value="school">Toàn trường</option>
                </select>
                {previewMode !== "school" && (
                  <select value={previewName} onChange={(event) => setPreviewName(event.target.value)}>
                    {(previewMode === "teacher" ? scheduleTeachers : scheduleClasses).map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                )}
                <button type="button" onClick={loadTimetableResult} title="Tải kết quả FET *_activities.xml">
                  <Upload size={17} /> Tải TKB
                </button>
                <button type="button" onClick={exportExcel} title="Tải xuống Excel">
                  <FileSpreadsheet size={17} /> Excel
                </button>
                <button type="button" onClick={() => exportPng("schedule-export", "thoi-khoa-bieu.png")}>
                  <Download size={17} /> PNG
                </button>
              </div>
            </div>
            <SchedulePreview
              id="schedule-export"
              mode={previewMode}
              campusName={selectedScheduleCampus}
              name={previewName}
              classes={scheduleClasses}
              teachers={scheduleTeachers}
              calendar={calendar}
              assignments={project.assignments}
              activities={build.activities}
              activityById={activityById}
              scheduledById={scheduledById}
              subjectColors={project.subjectColors}
            />
          </section>
        )}

        <StatusPanel kind="problems" errors={build.errors} warnings={build.warnings} runState={runState} />
      </main>

      <datalist id="classes-list">
        {classes.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="subjects-list">
        {subjects.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="teachers-list">
        {teachers.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id="tags-list">
        {tags.map((name) => <option key={name} value={name} />)}
      </datalist>
    </div>
  );
}

function StatusPanel({
  kind,
  errors,
  warnings,
  runState
}: {
  kind: "positive" | "problems";
  errors: string[];
  warnings: string[];
  runState: FetRunState;
}) {
  const hasPositive = Boolean(runState.resultText || runState.outputDir);
  const hasProblems = errors.length > 0 || warnings.length > 0 || Boolean(runState.errorsText || runState.warningsText);

  if ((kind === "positive" && !hasPositive) || (kind === "problems" && !hasProblems)) {
    return null;
  }

  return (
    <section className={`status-panel ${kind === "problems" ? "status-panel-bottom" : ""}`}>
      {kind === "positive" && (
        <>
          {runState.resultText && <pre className="status ok">{runState.resultText}</pre>}
          {runState.outputDir && <div className="status ok">Output: {runState.outputDir}</div>}
        </>
      )}
      {kind === "problems" && (
        <>
          {errors.map((error) => <div className="status error" key={error}>{error}</div>)}
          {warnings.map((warning) => <div className="status warning" key={warning}>{warning}</div>)}
          {runState.errorsText && <pre className="status error">{runState.errorsText}</pre>}
          {runState.warningsText && <pre className="status warning">{runState.warningsText}</pre>}
        </>
      )}
    </section>
  );
}

function CampusTabs({
  campuses,
  selectedCampus,
  setSelectedCampus
}: {
  campuses: string[];
  selectedCampus: string;
  setSelectedCampus: (campusName: string) => void;
}) {
  if (campuses.length <= 1) return null;
  return (
    <div className="campus-tabs" aria-label="Chọn điểm trường">
      {campuses.map((campus) => (
        <button
          key={campus}
          type="button"
          className={selectedCampus === campus ? "active" : ""}
          onClick={() => setSelectedCampus(campus)}
        >
          {campus}
        </button>
      ))}
    </div>
  );
}

function MultiCampusTeachersPanel({ project }: { project: TimetableProject }) {
  const teacherCampusMap = getTeacherCampusMap(project);
  const rows = Array.from(teacherCampusMap.entries())
    .map(([name, campusSet]) => ({
      name,
      campuses: Array.from(campusSet).sort((a, b) => a.localeCompare(b, "vi"))
    }))
    .filter((teacher) => teacher.campuses.length >= 2)
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  if (rows.length === 0) return null;

  return (
    <div className="panel wide">
      <div className="panel-title">
        <h2>Các giáo viên dạy nhiều trường</h2>
      </div>
      <div className="table-wrap">
        <table className="data-table compact">
          <thead>
            <tr>
              <th>Giáo viên</th>
              <th>Điểm trường</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{row.campuses.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PccmClassEditor({
  project,
  selectedCampusName,
  setSelectedCampusName,
  selectedClassName,
  setSelectedClassName,
  subjects,
  teachers,
  patchAssignment,
  deleteAssignment,
  addSubject
}: {
  project: TimetableProject;
  selectedCampusName: string;
  setSelectedCampusName: (campusName: string) => void;
  selectedClassName: string;
  setSelectedClassName: (className: string) => void;
  subjects: string[];
  teachers: string[];
  patchAssignment: (id: string, patch: Partial<Assignment>) => void;
  deleteAssignment: (id: string) => void;
  addSubject: () => void;
}) {
  const campusNames = project.settings.campuses.map((campus) => campus.name);
  const classNames = getCampusClasses(project, selectedCampusName).map((schoolClass) => schoolClass.name);
  const assignments = project.assignments.filter((assignment) => assignment.campusName === selectedCampusName && assignment.className === selectedClassName);

  return (
    <div className="pccm-editor">
      <CampusTabs campuses={campusNames} selectedCampus={selectedCampusName} setSelectedCampus={setSelectedCampusName} />
      <div className="class-button-row" aria-label="Chọn lớp">
        {classNames.map((className) => (
          <button
            key={className}
            type="button"
            className={selectedClassName === className ? "active" : ""}
            onClick={() => setSelectedClassName(className)}
          >
            {className}
          </button>
        ))}
      </div>

      {selectedClassName && (
        <div className="pccm-action-row">
          <strong>{selectedClassName}</strong>
          <button type="button" onClick={addSubject}>
            <Plus size={17} /> Thêm môn học
          </button>
        </div>
      )}

      {selectedClassName ? (
        <div className="table-wrap">
          <table className="data-table compact pccm-editor-table">
            <thead>
              <tr>
                <th>Môn</th>
                <th>Giáo viên</th>
                <th>Tổng tiết</th>
                <th>Môn chính</th>
                <th>Toàn trường</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => {
                const schoolWide = assignment.tag === "Toàn trường";
                return (
                  <tr key={assignment.id}>
                    <td>
                      <ComboInput
                        ariaLabel="Môn học"
                        value={assignment.subjectName}
                        onChange={(value) => patchAssignment(assignment.id, { subjectName: value })}
                        options={subjects}
                        placeholder="Chọn hoặc nhập môn"
                      />
                    </td>
                    <td>
                      <ComboInput
                        ariaLabel="Giáo viên"
                        value={assignment.teacherName}
                        onChange={(value) => patchAssignment(assignment.id, { teacherName: value })}
                        options={teachers}
                        placeholder="Chọn hoặc nhập giáo viên"
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={1}
                        value={assignment.weeklyPeriods}
                        onChange={(event) => patchAssignment(assignment.id, { weeklyPeriods: Number(event.target.value) })}
                      />
                    </td>
                    <td className="center">
                      <input
                        type="checkbox"
                        checked={assignment.isMainSubject}
                        onChange={(event) => patchAssignment(assignment.id, { isMainSubject: event.target.checked })}
                      />
                    </td>
                    <td className="center">
                      <input
                        type="checkbox"
                        checked={schoolWide}
                        onChange={(event) => patchAssignment(assignment.id, { tag: event.target.checked ? "Toàn trường" : "" })}
                      />
                    </td>
                    <td className="icon-cell">
                      <button type="button" className="icon-button danger" onClick={() => deleteAssignment(assignment.id)} title="Xóa">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-result">Chưa có lớp nào trong Thông tin cơ bản.</div>
      )}
    </div>
  );
}

function AssignmentsEditor({
  project,
  classes,
  subjects,
  teachers,
  tags,
  patchAssignment,
  deleteAssignment
}: {
  project: TimetableProject;
  classes: string[];
  subjects: string[];
  teachers: string[];
  tags: string[];
  patchAssignment: (id: string, patch: Partial<Assignment>) => void;
  deleteAssignment: (id: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table compact">
        <thead>
          <tr>
            <th>Lớp</th>
            <th>Môn</th>
            <th>Giáo viên</th>
            <th>Thẻ</th>
            <th>Tổng tiết</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {project.assignments.map((assignment) => (
            <tr key={assignment.id}>
              <td><DataInput list="classes-list" value={assignment.className} onChange={(value) => patchAssignment(assignment.id, { className: value })} fallback={classes} /></td>
              <td><DataInput list="subjects-list" value={assignment.subjectName} onChange={(value) => patchAssignment(assignment.id, { subjectName: value })} fallback={subjects} /></td>
              <td><DataInput list="teachers-list" value={assignment.teacherName} onChange={(value) => patchAssignment(assignment.id, { teacherName: value })} fallback={teachers} /></td>
              <td><DataInput list="tags-list" value={assignment.tag || ""} onChange={(value) => patchAssignment(assignment.id, { tag: value })} fallback={tags} /></td>
              <td>
                <input
                  className="small-input"
                  type="number"
                  min={1}
                  value={assignment.weeklyPeriods}
                  onChange={(event) => patchAssignment(assignment.id, { weeklyPeriods: Number(event.target.value) })}
                />
              </td>
              <td className="icon-cell">
                <button type="button" className="icon-button danger" onClick={() => deleteAssignment(assignment.id)} title="Xóa">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivitiesTable({
  project,
  selectedCampusName,
  setSelectedCampusName,
  selectedClassName,
  setSelectedClassName,
  patchAssignment,
  patchProject
}: {
  project: TimetableProject;
  selectedCampusName: string;
  setSelectedCampusName: (campusName: string) => void;
  selectedClassName: string;
  setSelectedClassName: (className: string) => void;
  patchAssignment: (id: string, patch: Partial<Assignment>) => void;
  patchProject: (updater: (draft: TimetableProject) => TimetableProject) => void;
}) {
  const campusNames = project.settings.campuses.map((campus) => campus.name);
  const classNames = getCampusClasses(project, selectedCampusName).map((schoolClass) => schoolClass.name);
  const assignments = project.assignments.filter((assignment) => assignment.campusName === selectedCampusName && assignment.className === selectedClassName);

  return (
    <div className="activities-by-class">
      <CampusTabs campuses={campusNames} selectedCampus={selectedCampusName} setSelectedCampus={setSelectedCampusName} />
      <div className="class-button-row" aria-label="Chọn lớp">
        {classNames.map((className) => (
          <button
            key={className}
            type="button"
            className={selectedClassName === className ? "active" : ""}
            onClick={() => setSelectedClassName(className)}
          >
            {className}
          </button>
        ))}
      </div>

      {selectedClassName ? (
        <div className="table-wrap tall">
          <table className="data-table activities-table">
            <thead>
              <tr>
                <th>Môn</th>
                <th>Giáo viên</th>
                <th>Tổng tiết</th>
                <th>Phân rã</th>
                <th>Mindays</th>
                <th>Trọng số</th>
                <th>HĐ liên tiếp</th>
                <th>Toàn trường</th>
                <th>Màu</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => {
                const schoolWide = assignment.tag === "Toàn trường";
                return (
                  <tr key={assignment.id}>
                    <td><strong>{assignment.subjectName || "Chưa chọn môn"}</strong></td>
                    <td>{assignment.teacherName || "Miễn GV"}</td>
                    <td className="number-cell">{assignment.weeklyPeriods}</td>
                    <td>
                      <input value={assignment.splitPattern} onChange={(event) => patchAssignment(assignment.id, { splitPattern: event.target.value })} />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        value={assignment.minDays}
                        onChange={(event) => patchAssignment(assignment.id, { minDays: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={assignment.weight}
                        onChange={(event) => patchAssignment(assignment.id, { weight: Number(event.target.value) })}
                      />
                    </td>
                    <td className="center">
                      <input
                        type="checkbox"
                        checked={assignment.consecutiveIfSameDay}
                        onChange={(event) => patchAssignment(assignment.id, { consecutiveIfSameDay: event.target.checked })}
                      />
                    </td>
                    <td className="center">
                      <input
                        type="checkbox"
                        checked={schoolWide}
                        onChange={(event) => patchAssignment(assignment.id, { tag: event.target.checked ? "Toàn trường" : "" })}
                      />
                    </td>
                    <td>
                      <input
                        type="color"
                        value={project.subjectColors[assignment.subjectName] || "#eeeeee"}
                        onChange={(event) => patchProject((draft) => {
                          draft.subjectColors[assignment.subjectName] = event.target.value;
                          return draft;
                        })}
                        title="Màu môn"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-result">Chưa có lớp nào trong Thông tin cơ bản.</div>
      )}

      <div className="activity-notes">
        <div>
          <strong>Phân rã:</strong>
          <span>
            Chia các tiết thành các nhóm khác nhau.
            <br />
            <strong>Ví dụ</strong>: 13 = 3 + 3 + 3 + 2 + 2, là 5 nhóm - <strong>Nhóm 1: 3 tiết</strong>,{" "}
            <strong>Nhóm 2: 3 tiết</strong>, <strong>Nhóm 3: 3 tiết</strong>, <strong>Nhóm 4: 2 tiết</strong>,{" "}
            <strong>Nhóm 5: 2 tiết</strong>
          </span>
        </div>
        <div>
          <strong>Mindays:</strong>
          <span>
            Số ngày thật tối thiểu giữa các nhóm đã phân rã.
            <br />
            <strong>Ví dụ</strong>:{" "}
            <strong>
              <em>Mindays = 0</em>
            </strong>{" "}
            cho phép một môn xuất hiện cả{" "}
            <strong>
              <em>S2 và C2</em>
            </strong>
            ;{" "}
            <strong>
              <em>Mindays = 1</em>
            </strong>{" "}
            nghĩa là nếu <strong>Thứ Hai</strong> đã có một nhóm thì nhóm tiếp theo sớm nhất là <strong>Thứ Ba</strong>.
          </span>
        </div>
        <div>
          <strong>Trọng số:</strong>
          <span>Nếu bằng 1 thì là ràng buộc chặt chẽ, nếu đặt là 0.99 thì sẽ nới lỏng 1 chút, tránh việc ràng buộc quá chặt khiến không xếp được thời khóa biểu.</span>
        </div>
        <div>
          <strong>HĐ liên tiếp</strong>
          <span>Tùy chọn này chỉ dùng khi Mindays bị phá lệ: nếu hai nhóm vẫn rơi vào cùng ngày thật, FET sẽ đặt chúng cùng một buổi và liền tiết.</span>
        </div>
      </div>
    </div>
  );
}

function PccmTable({ project, subjects, campusName }: { project: TimetableProject; subjects: string[]; campusName: string }) {
  const classes = getCampusClasses(project, campusName).map((schoolClass) => schoolClass.name);
  const campusAssignments = project.assignments.filter((assignment) => assignment.campusName === campusName);
  const allSubjects = unique([...subjects, ...campusAssignments.map((assignment) => assignment.subjectName).filter(Boolean)]);
  const mainSubjects = new Set(campusAssignments.filter((assignment) => assignment.isMainSubject).map((assignment) => assignment.subjectName));
  const grouped = new Map<string, Map<string, Assignment[]>>();
  for (const assignment of campusAssignments) {
    grouped.set(assignment.className, grouped.get(assignment.className) || new Map());
    const bySubject = grouped.get(assignment.className)!;
    bySubject.set(assignment.subjectName, [...(bySubject.get(assignment.subjectName) || []), assignment]);
  }

  return (
    <div className="table-wrap">
      <table className="pccm-table">
        <thead>
          <tr>
            <th>Bảng PCCM</th>
            <th>C/T</th>
            {allSubjects.map((subject) => <th key={subject}>{mainSubjects.has(subject) ? `${subject} (c)` : subject}</th>)}
          </tr>
        </thead>
        <tbody>
          {classes.map((className) => {
            const bySubject = grouped.get(className) || new Map<string, Assignment[]>();
            return (
              <Fragment key={className}>
                <tr key={`${className}-periods`}>
                  <th rowSpan={2}>{className}</th>
                  <th>Số tiết</th>
                  {allSubjects.map((subject) => {
                    const items = bySubject.get(subject) || [];
                    return <td key={subject}>{items.map((item) => item.weeklyPeriods).join("+")}</td>;
                  })}
                </tr>
                <tr key={`${className}-teachers`}>
                  <th>GV</th>
                  {allSubjects.map((subject) => {
                    const items = bySubject.get(subject) || [];
                    return <td key={subject}>{items.map((item) => item.teacherName || "Miễn GV").join(" | ")}</td>;
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeacherBusyList({
  teachers,
  selectedTeacher,
  setSelectedTeacher
}: {
  teachers: string[];
  selectedTeacher: string;
  setSelectedTeacher: (teacherName: string) => void;
}) {
  return (
    <aside className="busy-teacher-list" aria-label="Danh sách giáo viên">
      <div className="busy-teacher-list-title">Giáo viên</div>
      <div className="busy-teacher-list-scroll">
        {teachers.map((teacherName) => (
          <button
            type="button"
            key={teacherName}
            className={`busy-teacher-item ${teacherName === selectedTeacher ? "active" : ""}`}
            onClick={() => setSelectedTeacher(teacherName)}
          >
            {teacherName}
          </button>
        ))}
      </div>
    </aside>
  );
}

function BusyGrid({
  calendar,
  selectedTeacher,
  unavailable,
  dragBusy,
  setDragBusy,
  toggleUnavailableSlot
}: {
  calendar: ReturnType<typeof buildCalendar>;
  selectedTeacher: string;
  unavailable: TeacherUnavailableTimes[];
  dragBusy: { active: boolean; value: boolean };
  setDragBusy: (value: { active: boolean; value: boolean }) => void;
  toggleUnavailableSlot: (teacherName: string, slot: TimeSlot, forceValue?: boolean) => void;
}) {
  if (!selectedTeacher) {
    return <div className="empty-result">Chọn một giáo viên để thiết lập thời gian bận.</div>;
  }

  const busySlots = unavailable.find((item) => item.teacherName === selectedTeacher)?.slots || [];
  const busySet = new Set(busySlots.map(slotKey));

  return (
    <div className="busy-grid" style={{ "--day-count": calendar.dayNames.length } as React.CSSProperties}>
      <div className="busy-grid-head"></div>
      {calendar.dayNames.map((day) => <div className="busy-head" key={day}>{day}</div>)}
      {calendar.hourNames.map((hour, periodIndex) => (
        <Fragment key={hour}>
          <div className="busy-hour" key={`${hour}-label`}>{hour}</div>
          {calendar.dayNames.map((dayLabel) => {
            const slot = { dayLabel, periodIndex };
            const checked = busySet.has(slotKey(slot));
            return (
              <button
                type="button"
                className={checked ? "busy-cell busy" : "busy-cell"}
                key={slotKey(slot)}
                onMouseDown={() => {
                  const next = !checked;
                  setDragBusy({ active: true, value: next });
                  toggleUnavailableSlot(selectedTeacher, slot, next);
                }}
                onMouseEnter={() => {
                  if (dragBusy.active) toggleUnavailableSlot(selectedTeacher, slot, dragBusy.value);
                }}
                title={`${selectedTeacher} ${dayLabel} ${hour}`}
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function PreferredEditor({
  draft,
  setDraft,
  classes,
  subjects,
  teachers,
  tags,
  calendar
}: {
  draft: PreferredTimeConstraint;
  setDraft: (value: PreferredTimeConstraint) => void;
  classes: string[];
  subjects: string[];
  teachers: string[];
  tags: string[];
  calendar: ReturnType<typeof buildCalendar>;
}) {
  return (
    <div className="editor-stack">
      <div className="form-grid">
        <label>Môn<select value={draft.subjectName} onChange={(event) => setDraft({ ...draft, subjectName: event.target.value })}><option value="">*</option>{subjects.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>Lớp<select value={draft.className} onChange={(event) => setDraft({ ...draft, className: event.target.value })}><option value="">*</option>{classes.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>GV<select value={draft.teacherName} onChange={(event) => setDraft({ ...draft, teacherName: event.target.value })}><option value="">*</option>{teachers.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>Thẻ<select value={draft.tag} onChange={(event) => setDraft({ ...draft, tag: event.target.value })}><option value="">*</option>{tags.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>Buổi<select value={draft.dayLabel} onChange={(event) => setDraft({ ...draft, dayLabel: event.target.value })}>{calendar.dayNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>Tiết<select value={draft.periodIndex} onChange={(event) => setDraft({ ...draft, periodIndex: Number(event.target.value) })}>{calendar.hourNames.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
        <label>Trọng số<input type="number" min={0} max={1} step={0.01} value={draft.weight} onChange={(event) => setDraft({ ...draft, weight: Number(event.target.value) })} /></label>
        <label className="check-row"><input type="checkbox" checked={draft.permanentlyLocked} onChange={(event) => setDraft({ ...draft, permanentlyLocked: event.target.checked })} /> Khóa cứng</label>
      </div>
      <div className="preferred-notes">
        <div>
          <strong>Khóa cứng</strong>
          <span>Khi bật và để Trọng số = 1, hoạt động bắt buộc nằm đúng buổi/tiết đã chọn. Dùng cho các tiết cố định như Chào cờ. Nếu Trọng số thấp hơn 1, FET vẫn có thể phá lệ theo mức nới lỏng đó.</span>
        </div>
      </div>
    </div>
  );
}

function TeacherWorkloadPanel({
  project,
  calendarDayCount,
  selectedCampus,
  setSelectedCampus,
  campusNames,
  teachers,
  patchLimit
}: {
  project: TimetableProject;
  calendarDayCount: number;
  selectedCampus: string;
  setSelectedCampus: (value: string) => void;
  campusNames: string[];
  teachers: string[];
  patchLimit: (teacherName: string, patch: Partial<TeacherWorkloadLimit>) => void;
}) {
  const limitsByTeacher = new Map(project.constraints.teacherWorkloadLimits.map((item) => [item.teacherName, item]));
  const teacherPeriodTotals = new Map(sumBy(
    project.assignments.filter((assignment) => assignment.campusName === selectedCampus && assignment.teacherName),
    (assignment) => assignment.teacherName
  ));
  const maxRealDays = project.settings.numberOfDays;

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>RB số buổi đi của GV</h2>
      </div>
      <CampusTabs campuses={campusNames} selectedCampus={selectedCampus} setSelectedCampus={setSelectedCampus} />
      <p className="panel-guide">
        Số ngày là ngày thật như Thứ Hai, Thứ Ba; số buổi là từng buổi S2, C2, S3... Ràng buộc áp dụng global theo tên giáo viên trên toàn cụm, tab điểm trường dùng để lọc danh sách và xem số tiết tại điểm trường đang chọn.
      </p>
      {teachers.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table compact workload-table">
            <thead>
              <tr>
                <th>Giáo viên</th>
                <th>Số tiết</th>
                <th>Số ngày max</th>
                <th>Số ngày min</th>
                <th>Số buổi max</th>
                <th>Số buổi min</th>
                <th>Số buổi sáng max</th>
                <th>Số buổi chiều max</th>
                <th>Số buổi sáng min</th>
                <th>Số buổi chiều min</th>
                <th>Trọng số</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((teacherName) => {
                const limit = limitsByTeacher.get(teacherName);
                return (
                  <tr key={teacherName}>
                    <td><strong>{teacherName}</strong></td>
                    <td className="number-cell">{teacherPeriodTotals.get(teacherName) || 0}</td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        max={maxRealDays}
                        value={limit?.maxRealDays ?? ""}
                        onWheel={blurNumberInputOnWheel}
                        onChange={(event) => patchLimit(teacherName, { maxRealDays: parseOptionalInteger(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        max={maxRealDays}
                        value={limit?.minRealDays ?? ""}
                        onWheel={blurNumberInputOnWheel}
                        onChange={(event) => patchLimit(teacherName, { minRealDays: parseOptionalInteger(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        max={calendarDayCount}
                        value={limit?.maxSessions ?? ""}
                        onWheel={blurNumberInputOnWheel}
                        onChange={(event) => patchLimit(teacherName, { maxSessions: parseOptionalInteger(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        max={calendarDayCount}
                        value={limit?.minSessions ?? ""}
                        onWheel={blurNumberInputOnWheel}
                        onChange={(event) => patchLimit(teacherName, { minSessions: parseOptionalInteger(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        max={maxRealDays}
                        value={limit?.maxMornings ?? ""}
                        onWheel={blurNumberInputOnWheel}
                        onChange={(event) => patchLimit(teacherName, { maxMornings: parseOptionalInteger(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        max={maxRealDays}
                        value={limit?.maxAfternoons ?? ""}
                        onWheel={blurNumberInputOnWheel}
                        onChange={(event) => patchLimit(teacherName, { maxAfternoons: parseOptionalInteger(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        max={maxRealDays}
                        value={limit?.minMornings ?? ""}
                        onWheel={blurNumberInputOnWheel}
                        onChange={(event) => patchLimit(teacherName, { minMornings: parseOptionalInteger(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        max={maxRealDays}
                        value={limit?.minAfternoons ?? ""}
                        onWheel={blurNumberInputOnWheel}
                        onChange={(event) => patchLimit(teacherName, { minAfternoons: parseOptionalInteger(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={limit?.weight ?? 1}
                        onWheel={blurNumberInputOnWheel}
                        onChange={(event) => patchLimit(teacherName, { weight: Number(event.target.value) })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-result">Chưa có giáo viên nào trong điểm trường này.</div>
      )}
    </div>
  );
}

function blurNumberInputOnWheel(event: WheelEvent<HTMLInputElement>) {
  event.currentTarget.blur();
}

function ConstraintRows({
  preferredTimes,
  sameTimeGroups,
  assignmentById,
  removeConstraint
}: {
  preferredTimes: PreferredTimeConstraint[];
  sameTimeGroups: SameTimeConstraint[];
  assignmentById: Map<string, Assignment>;
  removeConstraint: (kind: "preferred" | "same", id: string) => void;
}) {
  if (preferredTimes.length === 0 && sameTimeGroups.length === 0) return null;

  return (
    <div className="constraint-list">
      {preferredTimes.map((item) => (
        <div className="constraint-row" key={item.id}>
          <span>{[item.campusName || "Toàn cụm", item.subjectName || "*", item.className || "*", item.teacherName || "*", item.tag || "*"].join(" / ")} → {item.dayLabel} Tiết {item.periodIndex + 1}</span>
          <button type="button" className="icon-button danger" onClick={() => removeConstraint("preferred", item.id)}><Trash2 size={15} /></button>
        </div>
      ))}
      {sameTimeGroups.map((item) => (
        <div className="constraint-row" key={item.id}>
          <span>{item.name}: {item.assignmentIds.map((id) => {
            const assignment = assignmentById.get(id);
            return assignment ? `${assignment.className}-${assignment.subjectName}` : id;
          }).join(", ")}</span>
          <button type="button" className="icon-button danger" onClick={() => removeConstraint("same", item.id)}><Trash2 size={15} /></button>
        </div>
      ))}
    </div>
  );
}

function StatsPanel({ project, selectedCampus, setSelectedCampus }: { project: TimetableProject; selectedCampus: string; setSelectedCampus: (campusName: string) => void }) {
  const [statsSubTab, setStatsSubTab] = useState<StatsSubTab>("teacher-total");
  const campusNames = project.settings.campuses.map((campus) => campus.name);
  const classNames = getCampusClasses(project, selectedCampus).map((schoolClass) => schoolClass.name);
  const classNameSet = new Set(classNames);
  const activeAssignments = project.assignments.filter((assignment) => assignment.campusName === selectedCampus && classNameSet.has(assignment.className));
  const teacherTotals = sumBy(activeAssignments.filter((assignment) => assignment.teacherName), (assignment) => assignment.teacherName);
  const classTotalMap = new Map(sumBy(activeAssignments, (assignment) => assignment.className));
  const classTotals = classNames.map((className): [string, number] => [className, classTotalMap.get(className) || 0]);

  return (
    <section className="data-shell stats-shell">
      <div className="data-subtabs stats-subtabs" role="tablist" aria-label="Các mục thống kê">
        {statsSubTabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={`data-subtab stats-subtab ${tab.tone} ${statsSubTab === tab.id ? "active" : ""}`}
            onClick={() => setStatsSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <CampusTabs campuses={campusNames} selectedCampus={selectedCampus} setSelectedCampus={setSelectedCampus} />
      {statsSubTab === "teacher-total" && <StatsTable title="Tổng số tiết dạy của giáo viên" rows={teacherTotals} />}
      {statsSubTab === "class-stats" && <StatsTable title="Thống kê theo lớp" rows={classTotals} />}
    </section>
  );
}

function StatsTable({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div className="panel">
      <div className="panel-title"><h2>{title}</h2></div>
      <table className="data-table compact">
        <tbody>
          {rows.map(([name, total]) => (
            <tr key={name}>
              <td>{name}</td>
              <td className="number-cell">{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SchedulePreview({
  id,
  mode,
  campusName,
  name,
  classes,
  teachers,
  calendar,
  assignments,
  activities,
  activityById,
  scheduledById,
  subjectColors
}: {
  id: string;
  mode: PreviewMode;
  campusName: string;
  name: string;
  classes: string[];
  teachers: string[];
  calendar: ReturnType<typeof buildCalendar>;
  assignments: Assignment[];
  activities: ReturnType<typeof buildFetFile>["activities"];
  activityById: Map<number, ReturnType<typeof buildFetFile>["activities"][number]>;
  scheduledById: Map<number, { id: number; dayLabel: string; periodIndex: number; room?: string }>;
  subjectColors: Record<string, string>;
}) {
  const hasResult = scheduledById.size > 0;

  if (mode === "school") {
    const schoolMatrix = buildSchoolMatrixSheet({
      title: "THỜI KHÓA BIỂU",
      classes,
      campusName,
      calendar,
      assignments,
      activities,
      activityById,
      scheduledById,
      subjectColors
    });
    const teacherMatrix = buildTeacherMatrixSheet({
      title: "THỜI KHÓA BIỂU GIÁO VIÊN",
      teachers,
      campusName,
      calendar,
      assignments,
      activities,
      activityById,
      scheduledById,
      subjectColors
    });

    return (
      <div className="schedule-export" id={id}>
        {!hasResult && <div className="empty-result">Chưa có kết quả FET. Hãy xuất `.fet` hoặc chạy `fet-cl.exe`.</div>}
        <MatrixTimetableGrid sheet={schoolMatrix} />
        <MatrixTimetableGrid sheet={teacherMatrix} />
      </div>
    );
  }

  const targets = [name || (mode === "teacher" ? teachers[0] : classes[0]) || ""];

  return (
    <div className="schedule-export" id={id}>
      {!hasResult && <div className="empty-result">Chưa có kết quả FET. Hãy xuất `.fet` hoặc chạy `fet-cl.exe`.</div>}
      {targets.map((target) => (
        <TimetableGrid
          key={`${mode}-${target}`}
          title={mode === "teacher" ? `Giáo viên ${target}` : `Lớp ${target}`}
          calendar={calendar}
          cells={buildCells({
            target,
            mode,
            campusName,
            calendar,
            assignments,
            activities,
            activityById,
            scheduledById
          })}
          subjectColors={subjectColors}
        />
      ))}
    </div>
  );
}

function MatrixTimetableGrid({ sheet }: { sheet: ExcelScheduleSheet }) {
  return (
    <div className="timetable-block matrix-block">
      <h3>{sheet.title}</h3>
      <table className="timetable-grid matrix-grid">
        <thead>
          <tr>
            {sheet.columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, columnIndex) => {
                if (cell.skip) return null;
                const Tag = columnIndex < 2 ? "th" : "td";
                return (
                  <Tag
                    key={`${rowIndex}-${columnIndex}`}
                    rowSpan={cell.rowSpan}
                    colSpan={cell.colSpan}
                    className={cell.rowSpan && cell.rowSpan > 1 ? "matrix-day-cell" : undefined}
                    style={{
                      backgroundColor: cell.fillColor || "#ffffff",
                      fontWeight: cell.bold ? 700 : 500,
                      fontSize: cell.fontSize ? `${cell.fontSize}px` : undefined
                    }}
                  >
                    {cell.value}
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function TimetableGrid({
  title,
  calendar,
  cells,
  subjectColors
}: {
  title: string;
  calendar: ReturnType<typeof buildCalendar>;
  cells: Map<string, Assignment & { duration?: number }>;
  subjectColors: Record<string, string>;
}) {
  return (
    <div className="timetable-block">
      <h3>{title}</h3>
      <table className="timetable-grid">
        <thead>
          <tr>
            <th>Tiết</th>
            {calendar.dayNames.map((day) => <th key={day}>{day}</th>)}
          </tr>
        </thead>
        <tbody>
          {calendar.hourNames.map((hour, periodIndex) => (
            <tr key={hour}>
              <th>{hour}</th>
              {calendar.dayNames.map((dayLabel) => {
                const item = cells.get(slotKey({ dayLabel, periodIndex }));
                return (
                  <td
                    key={`${dayLabel}-${periodIndex}`}
                    style={{ backgroundColor: item ? subjectColors[item.subjectName] || "#f2f2f2" : "#ffffff" }}
                  >
                    {item && (
                      <div className="cell-content">
                        <strong>{item.subjectName}</strong>
                        <span>{item.className} {item.teacherName ? `- ${item.teacherName}` : ""}</span>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildCells({
  target,
  mode,
  campusName,
  calendar,
  assignments,
  activities,
  activityById,
  scheduledById
}: {
  target: string;
  mode: PreviewMode;
  campusName?: string;
  calendar: ReturnType<typeof buildCalendar>;
  assignments: Assignment[];
  activities: ReturnType<typeof buildFetFile>["activities"];
  activityById: Map<number, ReturnType<typeof buildFetFile>["activities"][number]>;
  scheduledById: Map<number, { id: number; dayLabel: string; periodIndex: number; room?: string }>;
}): Map<string, Assignment & { duration?: number }> {
  const cells = new Map<string, Assignment & { duration?: number }>();

  if (scheduledById.size === 0) {
    return cells;
  }

  for (const scheduled of scheduledById.values()) {
    if (!calendar.dayNames.includes(scheduled.dayLabel)) continue;
    const activity = activityById.get(scheduled.id);
    if (!activity) continue;
    const assignment = assignments.find((item) => item.id === activity.assignmentId);
    if (!assignment) continue;
    if (campusName && activity.campusName !== campusName) continue;
    if (mode === "class" && activity.className !== target) continue;
    if (mode === "teacher" && activity.teacherName !== target) continue;
    placeScheduledCell(cells, calendar, scheduled, assignment, activity.duration);
  }

  if (mode === "school") {
    for (const activity of activities) {
      const scheduled = scheduledById.get(activity.id);
      if (!scheduled) continue;
      const assignment = assignments.find((item) => item.id === activity.assignmentId);
      if (!assignment) continue;
      if (campusName && activity.campusName !== campusName) continue;
      placeScheduledCell(cells, calendar, scheduled, assignment, activity.duration, false);
    }
  }

  return cells;
}

function placeScheduledCell(
  cells: Map<string, Assignment & { duration?: number }>,
  calendar: ReturnType<typeof buildCalendar>,
  scheduled: { dayLabel: string; periodIndex: number },
  assignment: Assignment,
  duration: number,
  overwrite = true
) {
  const durationSlots = Math.max(1, duration || 1);
  for (let offset = 0; offset < durationSlots; offset += 1) {
    const periodIndex = scheduled.periodIndex + offset;
    if (periodIndex < 0 || periodIndex >= calendar.hourNames.length) continue;
    const key = slotKey({ dayLabel: scheduled.dayLabel, periodIndex });
    if (!overwrite && cells.has(key)) continue;
    cells.set(key, { ...assignment, duration });
  }
}

function buildExcelExportPayload({
  project,
  mode,
  campusName,
  classes,
  teachers,
  calendar,
  assignments,
  activities,
  activityById,
  scheduledById,
  subjectColors
}: {
  project: TimetableProject;
  mode: PreviewMode;
  campusName: string;
  classes: string[];
  teachers: string[];
  calendar: ReturnType<typeof buildCalendar>;
  assignments: Assignment[];
  activities: ReturnType<typeof buildFetFile>["activities"];
  activityById: Map<number, ReturnType<typeof buildFetFile>["activities"][number]>;
  scheduledById: Map<number, { id: number; dayLabel: string; periodIndex: number; room?: string }>;
  subjectColors: Record<string, string>;
}) {
  const fallbackSchoolName = project.settings.institutionName.trim() || "Trường Tiểu Học";
  const exportSchoolName = campusName || fallbackSchoolName;
  const baseFileName = safeFileNameBase(`TKB ${exportSchoolName}`);

  if (mode === "school") {
    return {
      mode,
      schoolName: exportSchoolName,
      singleFile: true,
      defaultFileName: `${baseFileName}.xlsx`,
      files: [{
        fileName: `${baseFileName}.xlsx`,
        sheets: [
          buildSchoolMatrixSheet({
            title: "THỜI KHÓA BIỂU",
            classes,
            campusName,
            calendar,
            assignments,
            activities,
            activityById,
            scheduledById,
            subjectColors
          }),
          buildTeacherMatrixSheet({
            title: "THỜI KHÓA BIỂU GIÁO VIÊN",
            teachers,
            campusName,
            calendar,
            assignments,
            activities,
            activityById,
            scheduledById,
            subjectColors
          })
        ]
      }]
    };
  }

  if (mode === "teacher") {
    return {
      mode,
      schoolName: exportSchoolName,
      singleFile: true,
      defaultFileName: `${baseFileName} Giáo viên.xlsx`,
      files: [{
        fileName: `${baseFileName} Giáo viên.xlsx`,
        sheets: [buildTeacherStackedSheet({
          schoolName: exportSchoolName,
          teachers,
          campusName,
          calendar,
          assignments,
          activities,
          activityById,
          scheduledById,
          subjectColors
        })]
      }]
    };
  }

  return {
    mode,
    schoolName: exportSchoolName,
    folderName: baseFileName,
    files: classes.map((className): ExcelExportFile => ({
      fileName: `${safeFileNameBase(className)}.xlsx`,
      sheets: [buildExcelSheet({
        target: className,
        mode: "class",
        campusName,
        title: `Lớp ${className}`,
        calendar,
        assignments,
        activities,
        activityById,
        scheduledById,
        subjectColors
      })]
    }))
  };
}

function buildSchoolMatrixSheet({
  title,
  classes,
  campusName,
  calendar,
  assignments,
  activities,
  activityById,
  scheduledById,
  subjectColors
}: {
  title: string;
  classes: string[];
  campusName: string;
  calendar: ReturnType<typeof buildCalendar>;
  assignments: Assignment[];
  activities: ReturnType<typeof buildFetFile>["activities"];
  activityById: Map<number, ReturnType<typeof buildFetFile>["activities"][number]>;
  scheduledById: Map<number, { id: number; dayLabel: string; periodIndex: number; room?: string }>;
  subjectColors: Record<string, string>;
}): ExcelScheduleSheet {
  return {
    sheetName: "tkbLop",
    title,
    layout: "matrix",
    columns: ["THỨ", "TIẾT", ...classes],
    rows: buildMatrixRows({
      targets: classes,
      targetMode: "class",
      campusName,
      calendar,
      assignments,
      activities,
      activityById,
      scheduledById,
      subjectColors,
      valueFor: (item) => `${item.subjectName}${item.teacherName ? ` - ${item.teacherName}` : ""}`
    }),
    columnWidths: [7, 6, ...classes.map(() => 15)],
    rowHeight: 22,
    headerRowHeight: 22,
    titleFontSize: 22,
    schoolNameAlign: "left"
  };
}

function buildTeacherMatrixSheet({
  title,
  teachers,
  campusName,
  calendar,
  assignments,
  activities,
  activityById,
  scheduledById,
  subjectColors
}: {
  title: string;
  teachers: string[];
  campusName: string;
  calendar: ReturnType<typeof buildCalendar>;
  assignments: Assignment[];
  activities: ReturnType<typeof buildFetFile>["activities"];
  activityById: Map<number, ReturnType<typeof buildFetFile>["activities"][number]>;
  scheduledById: Map<number, { id: number; dayLabel: string; periodIndex: number; room?: string }>;
  subjectColors: Record<string, string>;
}): ExcelScheduleSheet {
  return {
    sheetName: "tkbGiaoVien",
    title,
    layout: "matrix",
    columns: ["THỨ", "TIẾT", ...teachers],
    rows: buildMatrixRows({
      targets: teachers,
      targetMode: "teacher",
      campusName,
      calendar,
      assignments,
      activities,
      activityById,
      scheduledById,
      subjectColors,
      valueFor: (item) => `${item.subjectName} - ${item.className}`
    }),
    columnWidths: [7, 6, ...teachers.map(() => 14)],
    rowHeight: 22,
    headerRowHeight: 22,
    titleFontSize: 22,
    schoolNameAlign: "left"
  };
}

function buildTeacherStackedSheet({
  schoolName,
  teachers,
  campusName,
  calendar,
  assignments,
  activities,
  activityById,
  scheduledById,
  subjectColors
}: {
  schoolName: string;
  teachers: string[];
  campusName: string;
  calendar: ReturnType<typeof buildCalendar>;
  assignments: Assignment[];
  activities: ReturnType<typeof buildFetFile>["activities"];
  activityById: Map<number, ReturnType<typeof buildFetFile>["activities"][number]>;
  scheduledById: Map<number, { id: number; dayLabel: string; periodIndex: number; room?: string }>;
  subjectColors: Record<string, string>;
}): ExcelScheduleSheet {
  return {
    sheetName: "tkbGiaoVien",
    title: "THỜI KHÓA BIỂU GIÁO VIÊN",
    layout: "stacked",
    columns: [],
    rows: [],
    sections: teachers.map((teacherName) => buildTeacherExcelSection({
      schoolName,
      teacherName,
      campusName,
      calendar,
      assignments,
      activities,
      activityById,
      scheduledById,
      subjectColors
    }))
  };
}

function buildTeacherExcelSection({
  schoolName,
  teacherName,
  campusName,
  calendar,
  assignments,
  activities,
  activityById,
  scheduledById,
  subjectColors
}: {
  schoolName: string;
  teacherName: string;
  campusName: string;
  calendar: ReturnType<typeof buildCalendar>;
  assignments: Assignment[];
  activities: ReturnType<typeof buildFetFile>["activities"];
  activityById: Map<number, ReturnType<typeof buildFetFile>["activities"][number]>;
  scheduledById: Map<number, { id: number; dayLabel: string; periodIndex: number; room?: string }>;
  subjectColors: Record<string, string>;
}): ExcelScheduleSection {
  const cells = buildCells({
    target: teacherName,
    mode: "teacher",
    campusName,
    calendar,
    assignments,
    activities,
    activityById,
    scheduledById
  });
  const subjects = unique(assignments
    .filter((assignment) => (!campusName || assignment.campusName === campusName) && assignment.teacherName === teacherName)
    .map((assignment) => assignment.subjectName));

  return {
    schoolName,
    title: `THỜI KHÓA BIỂU GIÁO VIÊN ${teacherName.toLocaleUpperCase("vi")}`,
    subtitleLeft: `Giáo viên: ${teacherName}`,
    subtitleRight: `Môn: ${subjects.join(", ")}`,
    columns: ["TIẾT", ...calendar.dayNames],
    columnWidths: [8, ...calendar.dayNames.map(() => 16)],
    rowHeight: 22,
    rows: calendar.hourNames.map((_hour, periodIndex) => [
      { value: periodLabel(periodIndex), bold: true, fillColor: "#ffffff" },
      ...calendar.dayNames.map((dayLabel) => {
        const item = cells.get(slotKey({ dayLabel, periodIndex }));
        if (!item) return { value: "" };
        return {
          value: `${item.subjectName} - ${item.className}`,
          fillColor: subjectColors[item.subjectName] || "#f2f2f2"
        };
      })
    ])
  };
}

function buildMatrixRows({
  targets,
  targetMode,
  campusName,
  calendar,
  assignments,
  activities,
  activityById,
  scheduledById,
  subjectColors,
  valueFor
}: {
  targets: string[];
  targetMode: "class" | "teacher";
  campusName: string;
  calendar: ReturnType<typeof buildCalendar>;
  assignments: Assignment[];
  activities: ReturnType<typeof buildFetFile>["activities"];
  activityById: Map<number, ReturnType<typeof buildFetFile>["activities"][number]>;
  scheduledById: Map<number, { id: number; dayLabel: string; periodIndex: number; room?: string }>;
  subjectColors: Record<string, string>;
  valueFor: (item: Assignment & { duration?: number }) => string;
}): ExcelCell[][] {
  const targetCells = new Map(targets.map((target) => [target, buildCells({
    target,
    mode: targetMode,
    campusName,
    calendar,
    assignments,
    activities,
    activityById,
    scheduledById
  })]));
  const rows: ExcelCell[][] = [];

  for (const dayLabel of calendar.dayNames) {
    calendar.hourNames.forEach((_hour, periodIndex) => {
      const row: ExcelCell[] = [
        periodIndex === 0
          ? { value: dayLabel, bold: true, fontSize: 24, rowSpan: calendar.hourNames.length, fillColor: "#ffffff" }
          : { value: "", skip: true },
        { value: periodLabel(periodIndex), bold: true, fillColor: "#ffffff" }
      ];

      for (const target of targets) {
        const item = targetCells.get(target)?.get(slotKey({ dayLabel, periodIndex }));
        row.push(item
          ? { value: valueFor(item), fillColor: subjectColors[item.subjectName] || "#f2f2f2" }
          : { value: "" });
      }

      rows.push(row);
    });
  }

  return rows;
}

function periodLabel(periodIndex: number): string {
  return String(periodIndex + 1);
}

function safeFileNameBase(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").replace(/\s+/g, " ");
  return normalized || "TKB";
}
function buildExcelSheet({
  target,
  mode,
  campusName,
  title,
  calendar,
  assignments,
  activities,
  activityById,
  scheduledById,
  subjectColors
}: {
  target: string;
  mode: "class" | "teacher";
  campusName: string;
  title: string;
  calendar: ReturnType<typeof buildCalendar>;
  assignments: Assignment[];
  activities: ReturnType<typeof buildFetFile>["activities"];
  activityById: Map<number, ReturnType<typeof buildFetFile>["activities"][number]>;
  scheduledById: Map<number, { id: number; dayLabel: string; periodIndex: number; room?: string }>;
  subjectColors: Record<string, string>;
}): ExcelScheduleSheet {
  const cells = buildCells({
    target,
    mode,
    campusName,
    calendar,
    assignments,
    activities,
    activityById,
    scheduledById
  });

  return {
    sheetName: safeSheetName(title),
    title,
    columns: ["Tiết", ...calendar.dayNames],
    rows: calendar.hourNames.map((hour, periodIndex) => [
      { value: hour, bold: true, fillColor: "#f7fafc" },
      ...calendar.dayNames.map((dayLabel) => {
        const item = cells.get(slotKey({ dayLabel, periodIndex }));
        if (!item) return { value: "" };
        return {
          value: `${item.subjectName}\n${item.className}${item.teacherName ? ` - ${item.teacherName}` : ""}`,
          fillColor: subjectColors[item.subjectName] || "#f2f2f2",
          bold: true
        };
      })
    ])
  };
}

function safeFilePart(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").replace(/\s+/g, "_");
  return normalized || "TKB";
}

function safeSheetName(value: string): string {
  const cleaned = value.trim().replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ");
  return (cleaned || "TKB").slice(0, 31);
}

function ComboInput({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const normalizedValue = value.trim().toLocaleLowerCase("vi");
  const filteredOptions = options
    .filter((option) => !normalizedValue || option.toLocaleLowerCase("vi").includes(normalizedValue))
    .slice(0, 80);
  const isCustomValue = Boolean(value.trim()) && !options.includes(value);

  return (
    <div className="combo-input">
      <input
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
      />
      {open && (
        <div className="combo-menu">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            ))
          ) : (
            <div className="combo-empty">Không có trong danh sách</div>
          )}
          {isCustomValue && <div className="combo-custom">Tự nhập: {value}</div>}
        </div>
      )}
    </div>
  );
}

function DataInput({ value, onChange, list, fallback }: { value: string; onChange: (value: string) => void; list: string; fallback: string[] }) {
  return <input value={value} list={list} onChange={(event) => onChange(event.target.value)} placeholder={fallback[0] || ""} />;
}

function NamesTextarea({ names, onChange }: { names: string[]; onChange: (value: string) => void }) {
  const namesText = names.join("\n");
  const [draft, setDraft] = useState(namesText);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing && draft !== namesText) {
      setDraft(namesText);
    }
  }, [draft, isEditing, namesText]);

  return (
    <textarea
      value={draft}
      onFocus={() => setIsEditing(true)}
      onBlur={() => setIsEditing(false)}
      onChange={(event) => {
        const nextValue = event.target.value;
        setDraft(nextValue);
        onChange(nextValue);
      }}
    />
  );
}

function makePreferredDraft(project: TimetableProject): PreferredTimeConstraint {
  const calendar = buildCalendar(project.settings);
  return {
    id: makeId("pref"),
    campusName: project.settings.campuses[0]?.name || "",
    subjectName: "",
    className: "",
    teacherName: "",
    tag: "",
    dayLabel: calendar.dayNames[0] || "T2",
    periodIndex: 0,
    weight: 1,
    permanentlyLocked: true
  };
}

function sumBy(assignments: Assignment[], keyOf: (assignment: Assignment) => string): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const assignment of assignments) {
    const key = keyOf(assignment) || "Miễn GV";
    map.set(key, (map.get(key) || 0) + assignment.weeklyPeriods);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "vi"));
}

function isDefaultMainSubject(subjectName: string): boolean {
  return subjectName.trim() === "Tiếng Việt" || subjectName.trim() === "Toán";
}

function parseNameList(raw: string): string[] {
  return unique(raw.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean));
}

function parseOptionalInteger(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.trunc(value);
}

function mergeTeacherWorkloadLimits(limits: TeacherWorkloadLimit[]): TeacherWorkloadLimit[] {
  const byTeacher = new Map<string, TeacherWorkloadLimit>();

  for (const limit of limits) {
    const teacherName = limit.teacherName?.trim();
    if (!teacherName) continue;

    const normalized: TeacherWorkloadLimit = {
      teacherName,
      maxRealDays: limit.maxRealDays,
      minRealDays: limit.minRealDays,
      maxSessions: limit.maxSessions,
      minSessions: limit.minSessions,
      maxMornings: limit.maxMornings,
      maxAfternoons: limit.maxAfternoons,
      minMornings: limit.minMornings,
      minAfternoons: limit.minAfternoons,
      weight: Number.isFinite(limit.weight) ? limit.weight : 1
    };
    const current = byTeacher.get(teacherName);
    if (!current) {
      byTeacher.set(teacherName, normalized);
      continue;
    }

    current.maxRealDays = mergeOptionalMin(current.maxRealDays, normalized.maxRealDays);
    current.minRealDays = mergeOptionalMax(current.minRealDays, normalized.minRealDays);
    current.maxSessions = mergeOptionalMin(current.maxSessions, normalized.maxSessions);
    current.minSessions = mergeOptionalMax(current.minSessions, normalized.minSessions);
    current.maxMornings = mergeOptionalMin(current.maxMornings, normalized.maxMornings);
    current.maxAfternoons = mergeOptionalMin(current.maxAfternoons, normalized.maxAfternoons);
    current.minMornings = mergeOptionalMax(current.minMornings, normalized.minMornings);
    current.minAfternoons = mergeOptionalMax(current.minAfternoons, normalized.minAfternoons);
    current.weight = Number.isFinite(current.weight) ? current.weight : normalized.weight;
  }

  return Array.from(byTeacher.values()).sort((a, b) => a.teacherName.localeCompare(b.teacherName, "vi"));
}

function mergeOptionalMin(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

function mergeOptionalMax(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueSlots(slots: TimeSlot[]): TimeSlot[] {
  const map = new Map<string, TimeSlot>();
  slots.forEach((slot) => map.set(slotKey(slot), slot));
  return Array.from(map.values());
}

function getCampusClasses(project: TimetableProject, campusName: string): SchoolClass[] {
  return project.classes
    .filter((schoolClass) => schoolClass.campusName === campusName)
    .sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));
}

function getCampusTeachers(project: TimetableProject, campusName: string): string[] {
  return Array.from(getTeacherCampusMap(project).entries())
    .filter(([, campusSet]) => campusSet.has(campusName))
    .map(([teacherName]) => teacherName)
    .sort((a, b) => a.localeCompare(b, "vi"));
}

function pruneTransientTeachers(
  teachers: TimetableProject["teachers"],
  referencedTeacherCampusMap: Map<string, Set<string>>
): TimetableProject["teachers"] {
  const referencedByCampus = new Map<string, string[]>();
  referencedTeacherCampusMap.forEach((campusSet, teacherName) => {
    campusSet.forEach((campusName) => {
      referencedByCampus.set(campusName, referencedByCampus.get(campusName) || []);
      referencedByCampus.get(campusName)!.push(teacherName);
    });
  });

  const removeNames = new Set<string>();
  referencedByCampus.forEach((referencedNames, campusName) => {
    referencedNames.forEach((finalName) => {
      const transientNames = teachers
        .filter((teacher) => (teacher.campusNames || []).includes(campusName))
        .filter((teacher) => !referencedTeacherCampusMap.has(teacher.name))
        .filter((teacher) => isLikelyTypingArtifact(teacher.name, finalName))
        .map((teacher) => teacher.name);

      if (unique(transientNames).length >= 2) {
        transientNames.forEach((name) => removeNames.add(name));
      }
    });
  });

  return teachers.filter((teacher) => !removeNames.has(teacher.name));
}

function isLikelyTypingArtifact(candidate: string, finalName: string): boolean {
  const candidateKey = teacherTypingKey(candidate);
  const finalKey = teacherTypingKey(finalName);
  if (!candidateKey || !finalKey) return false;
  if (candidateKey === finalKey) return candidate.trim() !== finalName.trim();
  return candidateKey.length < finalKey.length && finalKey.startsWith(candidateKey);
}

function teacherTypingKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .toLocaleLowerCase("vi")
    .replace(/\s+/g, " ");
}

function getTeacherCampusMap(project: TimetableProject): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (teacherName: string | undefined, campusName: string | undefined) => {
    const name = teacherName?.trim();
    const campus = campusName?.trim();
    if (!name || !campus) return;
    if (!map.has(name)) map.set(name, new Set());
    map.get(name)!.add(campus);
  };

  project.teachers.forEach((teacher) => {
    (teacher.campusNames || []).forEach((campusName) => add(teacher.name, campusName));
  });
  project.assignments.forEach((assignment) => add(assignment.teacherName, assignment.campusName));
  project.classes.forEach((schoolClass) => add(schoolClass.homeroomTeacherName, schoolClass.campusName));
  return map;
}

function defaultCampus(project: Partial<TimetableProject>, fallback: TimetableProject): string {
  return project.settings?.campuses?.[0]?.name
    || project.settings?.institutionName
    || fallback.settings.campuses[0]?.name
    || fallback.settings.institutionName
    || "Trường Tiểu Học";
}

function loadProject(): TimetableProject {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return migrateProject(JSON.parse(raw) as Partial<TimetableProject>);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return migrateProject(createSampleProject());
}

function loadStoredScheduleResult(): StoredScheduleResult | null {
  const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredScheduleResult>;
    if (!parsed.signature || !Array.isArray(parsed.scheduledActivities)) return null;
    return {
      signature: parsed.signature,
      sourceName: parsed.sourceName || "",
      savedAt: parsed.savedAt || "",
      scheduledActivities: parsed.scheduledActivities
    };
  } catch {
    localStorage.removeItem(SCHEDULE_STORAGE_KEY);
    return null;
  }
}

function makeScheduleSignature(activities: ScheduledActivity[] | Array<{ id: number; assignmentId?: string; duration?: number; className?: string; subjectName?: string; teacherName?: string }>): string {
  return activities
    .map((activity) => [
      activity.id,
      "assignmentId" in activity ? activity.assignmentId || "" : "",
      "duration" in activity ? activity.duration || 0 : 0,
      "className" in activity ? activity.className || "" : "",
      "subjectName" in activity ? activity.subjectName || "" : "",
      "teacherName" in activity ? activity.teacherName || "" : ""
    ].join(":"))
    .join("|");
}

function pickLocalTextFile(accept: string): Promise<{ name: string; content: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let settled = false;

    function finish(result: { name: string; content: string } | null) {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(result);
    }

    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      finish({ name: file.name, content: await file.text() });
    });
    input.addEventListener("cancel", () => finish(null));
    window.addEventListener("focus", () => {
      window.setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) finish(null);
      }, 500);
    }, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

function migrateProject(project: Partial<TimetableProject>): TimetableProject {
  const fallback = createSampleProject();
  const fallbackCampus = defaultCampus(project, fallback);
  const rawCampuses = project.settings?.campuses?.length
    ? project.settings.campuses
    : [{ id: fallbackCampus, name: fallbackCampus }];
  const rawAssignments = project.assignments || fallback.assignments;
  const rawClasses = project.classes || fallback.classes;
  const normalizedClasses = rawClasses.map((schoolClass) => ({
    ...schoolClass,
    id: schoolClass.id || `${schoolClass.campusName || fallbackCampus}-${schoolClass.name}`,
    campusName: schoolClass.campusName || fallbackCampus
  }));
  const classKeys = new Set(normalizedClasses.map((schoolClass) => `${schoolClass.campusName}::${schoolClass.name}`));
  const assignments = rawAssignments
    .map((assignment) => ({ ...assignment, campusName: assignment.campusName || fallbackCampus }))
    .filter((assignment) => classKeys.has(`${assignment.campusName}::${assignment.className}`))
    .map((assignment) => ({
      ...assignment,
      isMainSubject: assignment.isMainSubject ?? isDefaultMainSubject(assignment.subjectName)
    }));
  const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
  const teacherCampusMap = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    if (!assignment.teacherName) continue;
    teacherCampusMap.set(assignment.teacherName, teacherCampusMap.get(assignment.teacherName) || new Set());
    teacherCampusMap.get(assignment.teacherName)!.add(assignment.campusName);
  }
  for (const schoolClass of normalizedClasses) {
    if (!schoolClass.homeroomTeacherName) continue;
    teacherCampusMap.set(schoolClass.homeroomTeacherName, teacherCampusMap.get(schoolClass.homeroomTeacherName) || new Set());
    teacherCampusMap.get(schoolClass.homeroomTeacherName)!.add(schoolClass.campusName);
  }
  const rawTeachers = project.teachers || fallback.teachers;
  const teachers = pruneTransientTeachers(rawTeachers.map((teacher) => ({
    ...teacher,
    campusNames: unique([
      ...(teacher.campusNames || []),
      ...Array.from(teacherCampusMap.get(teacher.name) || []),
      ...(!(teacher.campusNames || []).length && !teacherCampusMap.has(teacher.name) ? [fallbackCampus] : [])
    ])
  })), teacherCampusMap);
  const teacherNames = new Set([...teachers.map((teacher) => teacher.name), ...teacherCampusMap.keys()]);
  const teacherWorkloadLimits = mergeTeacherWorkloadLimits(
    (project.constraints?.teacherWorkloadLimits || fallback.constraints.teacherWorkloadLimits)
      .filter((constraint) => constraint.teacherName && teacherNames.has(constraint.teacherName))
  );

  return {
    settings: {
      ...fallback.settings,
      ...project.settings,
      institutionName: project.settings?.institutionName || rawCampuses.map((campus) => campus.name).join(" + "),
      campuses: rawCampuses
    },
    classes: normalizedClasses.map((schoolClass) => ({
      id: schoolClass.id || `${schoolClass.campusName}-${schoolClass.name}`,
      name: schoolClass.name,
      campusName: schoolClass.campusName,
      studentCount: schoolClass.studentCount,
      homeroomTeacherName: schoolClass.homeroomTeacherName || inferHomeroomTeacher(assignments, schoolClass.campusName, schoolClass.name)
    })),
    subjects: project.subjects || fallback.subjects,
    teachers,
    assignments,
    constraints: {
      basic: {
        ...fallback.constraints.basic,
        ...project.constraints?.basic
      },
      teacherUnavailableTimes: project.constraints?.teacherUnavailableTimes || fallback.constraints.teacherUnavailableTimes,
      preferredTimes: (project.constraints?.preferredTimes || fallback.constraints.preferredTimes)
        .map((constraint) => ({ ...constraint, campusName: constraint.campusName || "" }))
        .filter((constraint) => !constraint.className || !constraint.campusName || classKeys.has(`${constraint.campusName}::${constraint.className}`)),
      teacherWorkloadLimits,
      sameTimeGroups: (project.constraints?.sameTimeGroups || fallback.constraints.sameTimeGroups)
        .map((group) => ({
          ...group,
          assignmentIds: group.assignmentIds.filter((assignmentId) => assignmentIds.has(assignmentId))
        }))
        .filter((group) => group.assignmentIds.length > 0)
    },
    subjectColors: {
      ...fallback.subjectColors,
      ...project.subjectColors
    }
  };
}

function inferHomeroomTeacher(assignments: Assignment[], campusName: string, className: string): string {
  const candidates = assignments
    .filter((assignment) => assignment.campusName === campusName && assignment.className === className && assignment.teacherName)
    .sort((a, b) => b.weeklyPeriods - a.weeklyPeriods);
  return candidates[0]?.teacherName || "";
}

