const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const ExcelJS = require("exceljs");

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: "TKB Tiểu Học",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    win.loadURL(devServer);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("save-text-file", async (_event, payload) => {
  const result = await dialog.showSaveDialog({
    title: payload.title || "Lưu file",
    defaultPath: payload.defaultPath || "du-lieu-tkb.fet",
    filters: payload.filters || [{ name: "All files", extensions: ["*"] }]
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }

  await fsp.writeFile(result.filePath, payload.content, "utf8");
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle("open-json-file", async () => {
  const result = await dialog.showOpenDialog({
    title: "Mở dữ liệu thời khóa biểu",
    filters: [{ name: "Timetable JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }

  const content = await fsp.readFile(result.filePaths[0], "utf8");
  return { ok: true, filePath: result.filePaths[0], content };
});

ipcMain.handle("export-excel-files", async (_event, payload) => {
  try {
    const files = Array.isArray(payload.files) ? payload.files : [];
    if (files.length === 0) {
      return { ok: false, error: "Không có thời khóa biểu để xuất Excel." };
    }

    if (payload.mode === "school" || payload.singleFile) {
      const firstFile = files[0] || {};
      const result = await dialog.showSaveDialog({
        title: payload.mode === "teacher" ? "Lưu thời khóa biểu giáo viên" : "Lưu thời khóa biểu toàn trường",
        defaultPath: payload.defaultFileName || firstFile.fileName || `TKB ${safeFilePart(payload.schoolName || "Truong")}.xlsx`,
        filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }]
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };

      await writeExcelWorkbook(result.filePath, payload.schoolName, firstFile.sheets || []);
      return { ok: true, filePath: result.filePath };
    }
    const result = await dialog.showOpenDialog({
      title: "Chọn thư mục lưu Excel",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };

    const folderPath = path.join(result.filePaths[0], payload.folderName || "TKB");
    await fsp.mkdir(folderPath, { recursive: true });
    const written = [];
    for (const file of files) {
      const filePath = path.join(folderPath, safeExcelFileName(file.fileName));
      await writeExcelWorkbook(filePath, payload.schoolName, file.sheets || []);
      written.push(filePath);
    }

    return { ok: true, folderPath, filePath: written[0] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("select-fet-cl", async () => {
  const result = await dialog.showOpenDialog({
    title: "Chọn fet-cl.exe",
    filters: [{ name: "FET command line", extensions: ["exe"] }],
    properties: ["openFile"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }

  return { ok: true, filePath: result.filePaths[0] };
});

ipcMain.handle("locate-fet-cl", async () => {
  const found = await locateFetCl();
  return { ok: Boolean(found), filePath: found };
});

ipcMain.handle("run-fet-cl", async (_event, payload) => {
  const fetClPath = payload.fetClPath || await locateFetCl();
  if (!fetClPath) {
    return {
      ok: false,
      error: "Chưa tìm thấy fet-cl.exe. Hãy build FET command-line hoặc chọn đúng file fet-cl.exe."
    };
  }

  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "tkb-fet-"));
  const inputFile = path.join(tempRoot, "input.fet");
  const outputDir = path.join(tempRoot, "output");
  await fsp.mkdir(outputDir, { recursive: true });
  await fsp.writeFile(inputFile, payload.xml, "utf8");

  const args = [
    `--inputfile=${inputFile}`,
    `--outputdir=${outputDir}`,
    `--timelimitseconds=${Number(payload.timeLimitSeconds || 300)}`,
    "--language=vi",
    "--writetimetablesxml=true",
    "--writetimetablesactivities=true",
    "--htmllevel=2"
  ];

  const execution = await runProcess(fetClPath, args, tempRoot);
  const activitiesXmlPath = await findNewestActivityXml(outputDir);
  const resultPath = await findNewestFile(path.join(outputDir, "logs"), "result.txt");
  const warningsPath = await findNewestFile(path.join(outputDir, "logs"), "warnings.txt");
  const errorsPath = await findNewestFile(path.join(outputDir, "logs"), "errors.txt");

  return {
    ok: execution.exitCode === 0 && Boolean(activitiesXmlPath),
    fetClPath,
    inputFile,
    outputDir,
    exitCode: execution.exitCode,
    stdout: execution.stdout,
    stderr: execution.stderr,
    activitiesXml: activitiesXmlPath ? await fsp.readFile(activitiesXmlPath, "utf8") : "",
    resultText: resultPath ? await fsp.readFile(resultPath, "utf8") : "",
    warningsText: warningsPath ? await fsp.readFile(warningsPath, "utf8") : "",
    errorsText: errorsPath ? await fsp.readFile(errorsPath, "utf8") : ""
  };
});

async function locateFetCl() {
  const candidates = [
    process.env.FET_CL_PATH,
    path.resolve(process.resourcesPath || "", "fet", "fet-cl.exe"),
    path.resolve(__dirname, "..", "vendor", "fet", "fet-cl.exe"),
    path.resolve(__dirname, "..", "..", "fet-cl.exe"),
    path.resolve(__dirname, "..", "..", "..", "fet-7.9.4-win", "fet-7.9.4", "fet-cl.exe"),
    path.resolve(__dirname, "..", "..", "..", "fet-7.9.4", "fet-cl.exe"),
    path.resolve(__dirname, "..", "..", "..", "fet-7.9.2", "fet-cl.exe"),
    path.resolve(__dirname, "..", "..", "..", "fet-7.9.2", "build", "src", "cl", "fet-cl.exe"),
    path.resolve(__dirname, "..", "..", "..", "fet-7.9.2", "build", "src", "cl", "Release", "fet-cl.exe"),
    path.resolve(__dirname, "..", "..", "..", "fet-7.9.2", "build-cl", "src", "cl", "fet-cl.exe"),
    path.resolve(process.resourcesPath || "", "fet-cl.exe")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  if (process.platform === "win32") {
    const where = await runProcess("where.exe", ["fet-cl"], process.cwd()).catch(() => null);
    if (where && where.exitCode === 0) {
      const first = where.stdout.split(/\r?\n/).find(Boolean);
      if (first && fs.existsSync(first)) return first;
    }
  }

  return "";
}

function runProcess(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ exitCode: -1, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? -1, stdout, stderr });
    });
  });
}

async function findNewestFile(root, fileName) {
  return findNewestFileMatching(root, (name) => name.toLowerCase() === fileName.toLowerCase());
}

async function findNewestActivityXml(root) {
  return findNewestFileMatching(root, (name) => {
    const lower = name.toLowerCase();
    return lower === "activities.xml" || lower === "activities_timetable.xml" || lower.endsWith("_activities.xml");
  });
}

async function findNewestFileMatching(root, matchesFileName) {
  if (!root || !fs.existsSync(root)) return "";
  const matches = [];
  await walk(root, matches, matchesFileName);
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.filePath || "";
}

async function walk(dir, matches, matchesFileName) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, matches, matchesFileName);
    } else if (matchesFileName(entry.name)) {
      const stat = await fsp.stat(fullPath);
      matches.push({ filePath: fullPath, mtimeMs: stat.mtimeMs });
    }
  }
}

async function writeExcelWorkbook(filePath, schoolName, sheets) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TKB Tiểu Học";
  workbook.created = new Date();
  workbook.modified = new Date();

  const safeSheets = Array.isArray(sheets) && sheets.length > 0 ? sheets : [{
    sheetName: "TKB",
    title: "Thời khóa biểu",
    columns: ["Tiết"],
    rows: []
  }];

  for (const sheetSpec of safeSheets) {
    const worksheet = workbook.addWorksheet(safeSheetName(sheetSpec.sheetName || sheetSpec.title || "TKB"));
    if (sheetSpec.layout === "stacked") {
      writeStackedScheduleSheet(worksheet, schoolName, sheetSpec);
    } else {
      writeScheduleSheet(worksheet, schoolName, sheetSpec);
    }
  }

  await workbook.xlsx.writeFile(filePath);
}

function writeScheduleSheet(worksheet, schoolName, sheetSpec) {
  const columns = Array.isArray(sheetSpec.columns) && sheetSpec.columns.length > 0 ? sheetSpec.columns : ["Tiết"];
  const columnCount = columns.length;

  setupWorksheet(worksheet);

  worksheet.mergeCells(1, 1, 1, columnCount);
  const schoolCell = worksheet.getCell(1, 1);
  schoolCell.value = schoolName || "Trường Tiểu Học";
  schoolCell.font = { bold: true, size: 13, color: { argb: "FF111827" } };
  schoolCell.alignment = { horizontal: sheetSpec.schoolNameAlign || "center", vertical: "middle", wrapText: true };
  worksheet.getRow(1).height = 24;

  worksheet.mergeCells(2, 1, 2, columnCount);
  const titleCell = worksheet.getCell(2, 1);
  titleCell.value = sheetSpec.title || "Thời khóa biểu";
  titleCell.font = { bold: true, size: sheetSpec.titleFontSize || 14, color: { argb: "FF000000" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(2).height = sheetSpec.titleFontSize && sheetSpec.titleFontSize > 16 ? 34 : 24;

  const headerRowIndex = 5;
  columns.forEach((column, index) => {
    const cell = worksheet.getCell(headerRowIndex, index + 1);
    cell.value = column;
    styleExcelCell(cell, { bold: true, fillColor: "#ffffff" });
  });
  worksheet.getRow(headerRowIndex).height = sheetSpec.headerRowHeight || 24;

  const rows = Array.isArray(sheetSpec.rows) ? sheetSpec.rows : [];
  rows.forEach((row, rowIndex) => {
    const excelRowIndex = headerRowIndex + rowIndex + 1;
    row.forEach((cellData, columnIndex) => {
      if (cellData?.skip) return;
      const cell = worksheet.getCell(excelRowIndex, columnIndex + 1);
      cell.value = cellData?.value || "";
      styleExcelCell(cell, cellData || {});
      mergeCellIfNeeded(worksheet, excelRowIndex, columnIndex + 1, cellData || {});
    });
    worksheet.getRow(excelRowIndex).height = sheetSpec.rowHeight || 58;
  });

  setColumnWidths(worksheet, columnCount, sheetSpec.columnWidths);
}

function writeStackedScheduleSheet(worksheet, schoolName, sheetSpec) {
  const sections = Array.isArray(sheetSpec.sections) ? sheetSpec.sections : [];
  const columnCount = Math.max(1, ...sections.map((section) => Array.isArray(section.columns) ? section.columns.length : 1));

  setupWorksheet(worksheet);
  let rowIndex = 1;

  for (const section of sections) {
    const columns = Array.isArray(section.columns) && section.columns.length > 0 ? section.columns : ["Tiết"];
    const sectionColumnCount = Math.max(columnCount, columns.length);

    worksheet.mergeCells(rowIndex, 1, rowIndex, sectionColumnCount);
    const schoolCell = worksheet.getCell(rowIndex, 1);
    schoolCell.value = section.schoolName || schoolName || "Trường Tiểu Học";
    schoolCell.font = { bold: true, size: 12, color: { argb: "FF111827" } };
    schoolCell.alignment = { horizontal: "left", vertical: "middle" };
    worksheet.getRow(rowIndex).height = 20;
    rowIndex += 1;

    worksheet.mergeCells(rowIndex, 1, rowIndex, sectionColumnCount);
    const titleCell = worksheet.getCell(rowIndex, 1);
    titleCell.value = section.title || sheetSpec.title || "Thời khóa biểu giáo viên";
    titleCell.font = { bold: true, size: 18, color: { argb: "FF000000" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(rowIndex).height = 28;
    rowIndex += 1;

    const infoSplit = Math.max(2, Math.min(sectionColumnCount - 1, Math.floor(sectionColumnCount / 3)));
    worksheet.mergeCells(rowIndex, 1, rowIndex, infoSplit);
    const leftInfoCell = worksheet.getCell(rowIndex, 1);
    leftInfoCell.value = section.subtitleLeft || "";
    leftInfoCell.font = { bold: true, size: 12, color: { argb: "FF111827" } };
    leftInfoCell.alignment = { horizontal: "left", vertical: "middle" };

    if (infoSplit + 1 <= sectionColumnCount) {
      worksheet.mergeCells(rowIndex, infoSplit + 1, rowIndex, sectionColumnCount);
      const rightInfoCell = worksheet.getCell(rowIndex, infoSplit + 1);
      rightInfoCell.value = section.subtitleRight || "";
      rightInfoCell.font = { bold: true, size: 12, color: { argb: "FF111827" } };
      rightInfoCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    }
    worksheet.getRow(rowIndex).height = 22;
    rowIndex += 2;

    columns.forEach((column, index) => {
      const cell = worksheet.getCell(rowIndex, index + 1);
      cell.value = column;
      styleExcelCell(cell, { bold: true, fillColor: "#ffffff" });
    });
    worksheet.getRow(rowIndex).height = 22;
    rowIndex += 1;

    const rows = Array.isArray(section.rows) ? section.rows : [];
    rows.forEach((row) => {
      row.forEach((cellData, columnIndex) => {
        if (cellData?.skip) return;
        const cell = worksheet.getCell(rowIndex, columnIndex + 1);
        cell.value = cellData?.value || "";
        styleExcelCell(cell, cellData || {});
        mergeCellIfNeeded(worksheet, rowIndex, columnIndex + 1, cellData || {});
      });
      worksheet.getRow(rowIndex).height = section.rowHeight || 22;
      rowIndex += 1;
    });

    rowIndex += 3;
    setColumnWidths(worksheet, sectionColumnCount, section.columnWidths || sheetSpec.columnWidths);
  }
}

function setupWorksheet(worksheet) {
  worksheet.views = [{ showGridLines: true }];
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.2, footer: 0.2 }
  };
}

function setColumnWidths(worksheet, columnCount, columnWidths) {
  for (let column = 1; column <= columnCount; column += 1) {
    const fallbackWidth = column === 1 ? 8 : column === 2 ? 7 : 16;
    worksheet.getColumn(column).width = Array.isArray(columnWidths) && columnWidths[column - 1]
      ? columnWidths[column - 1]
      : fallbackWidth;
  }
}

function mergeCellIfNeeded(worksheet, rowIndex, columnIndex, cellData) {
  const rowSpan = Math.max(1, Number(cellData.rowSpan || 1));
  const colSpan = Math.max(1, Number(cellData.colSpan || 1));
  if (rowSpan > 1 || colSpan > 1) {
    worksheet.mergeCells(rowIndex, columnIndex, rowIndex + rowSpan - 1, columnIndex + colSpan - 1);
  }
}

function styleExcelCell(cell, cellData) {
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.font = {
    bold: Boolean(cellData.bold),
    size: cellData.fontSize || 10,
    color: { argb: "FF000000" }
  };
  cell.border = {
    top: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } }
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: hexToArgb(cellData.fillColor || "#ffffff") }
  };
}

function hexToArgb(hex) {
  const cleaned = String(hex || "").replace("#", "").trim();
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return `FF${cleaned.toUpperCase()}`;
  return "FFFFFFFF";
}
function safeExcelFileName(fileName) {
  const cleaned = String(fileName || "TKB.xlsx")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "_")
    .trim();
  return cleaned.toLowerCase().endsWith(".xlsx") ? cleaned : `${cleaned || "TKB"}.xlsx`;
}

function safeFilePart(value) {
  return String(value || "TKB")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "_")
    .trim() || "TKB";
}

function safeSheetName(value) {
  const cleaned = String(value || "TKB").replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "TKB").slice(0, 31);
}
