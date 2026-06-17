import { z } from "zod";
import { tildaGet } from "../client.js";

// --- get_projects ---
export const getProjectsSchema = z.object({});

export async function handleGetProjects(_params: z.infer<typeof getProjectsSchema>): Promise<string> {
  const result = await tildaGet("getprojectslist");
  return JSON.stringify(result, null, 2);
}

// --- get_project_info ---
export const getProjectInfoSchema = z.object({
  projectid: z.string().describe("ID проекта Tilda"),
});

export async function handleGetProjectInfo(params: z.infer<typeof getProjectInfoSchema>): Promise<string> {
  const result = await tildaGet("getprojectinfo", {
    projectid: params.projectid,
  });
  return JSON.stringify(result, null, 2);
}

// --- get_pages ---
export const getPagesSchema = z.object({
  projectid: z.string().describe("ID проекта Tilda"),
});

export async function handleGetPages(params: z.infer<typeof getPagesSchema>): Promise<string> {
  const result = await tildaGet("getpageslist", {
    projectid: params.projectid,
  });
  return JSON.stringify(result, null, 2);
}

// --- get_page ---
export const getPageSchema = z.object({
  pageid: z.string().describe("ID страницы Tilda"),
});

export async function handleGetPage(params: z.infer<typeof getPageSchema>): Promise<string> {
  const result = await tildaGet("getpagefull", {
    pageid: params.pageid,
  });
  return JSON.stringify(result, null, 2);
}

// --- get_page_export ---
export const getPageExportSchema = z.object({
  pageid: z.string().describe("ID страницы Tilda"),
});

export async function handleGetPageExport(params: z.infer<typeof getPageExportSchema>): Promise<string> {
  const result = await tildaGet("getpagefullexport", {
    pageid: params.pageid,
  });
  return JSON.stringify(result, null, 2);
}
