export {};

declare global {
  interface Window {
    timetableDesktop?: {
      saveTextFile(payload: {
        title?: string;
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        content: string;
      }): Promise<{ ok: boolean; canceled?: boolean; filePath?: string }>;
      openJsonFile(): Promise<{ ok: boolean; canceled?: boolean; filePath?: string; content?: string }>;
      exportExcelFiles(payload: {
        mode: "class" | "teacher" | "school";
        schoolName: string;
        folderName?: string;
        defaultFileName?: string;
        singleFile?: boolean;
        files: Array<{
          fileName: string;
          sheets: Array<{
            sheetName: string;
            title: string;
            columns: string[];
            rows: Array<Array<{
              value: string;
              fillColor?: string;
              bold?: boolean;
              fontSize?: number;
              rowSpan?: number;
              colSpan?: number;
              skip?: boolean;
            }>>;
            layout?: "schedule" | "matrix" | "stacked";
            sections?: Array<{
              schoolName?: string;
              title: string;
              subtitleLeft?: string;
              subtitleRight?: string;
              columns: string[];
              rows: Array<Array<{
                value: string;
                fillColor?: string;
                bold?: boolean;
                fontSize?: number;
                rowSpan?: number;
                colSpan?: number;
                skip?: boolean;
              }>>;
              columnWidths?: number[];
              rowHeight?: number;
            }>;
            columnWidths?: number[];
            rowHeight?: number;
            headerRowHeight?: number;
            titleFontSize?: number;
            schoolNameAlign?: "left" | "center";
          }>;
        }>;
      }): Promise<{ ok: boolean; canceled?: boolean; filePath?: string; folderPath?: string; error?: string }>;
      selectFetCl(): Promise<{ ok: boolean; canceled?: boolean; filePath?: string }>;
      locateFetCl(): Promise<{ ok: boolean; filePath?: string }>;
      runFetCl(payload: {
        xml: string;
        fetClPath?: string;
        timeLimitSeconds?: number;
      }): Promise<{
        ok: boolean;
        error?: string;
        fetClPath?: string;
        inputFile?: string;
        outputDir?: string;
        exitCode?: number;
        stdout?: string;
        stderr?: string;
        activitiesXml?: string;
        resultText?: string;
        warningsText?: string;
        errorsText?: string;
      }>;
    };
  }
}
