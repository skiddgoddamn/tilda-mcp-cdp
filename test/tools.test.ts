import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  handleGetProjects,
  handleGetProjectInfo,
  handleGetPages,
  handleGetPage,
  handleGetPageExport,
} from "../src/tools/pages.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  process.env.TILDA_PUBLIC_KEY = "test-pub";
  process.env.TILDA_SECRET_KEY = "test-sec";
  mockFetch.mockReset();
});

afterEach(() => {
  delete process.env.TILDA_PUBLIC_KEY;
  delete process.env.TILDA_SECRET_KEY;
});

function okResponse(result: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ status: "FOUND", result }),
  });
}

describe("get_projects", () => {
  it("returns projects list", async () => {
    const projects = [{ id: "1", title: "My Site" }];
    mockFetch.mockReturnValueOnce(okResponse(projects));

    const out = await handleGetProjects({});
    expect(JSON.parse(out)).toEqual(projects);
    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("getprojectslist");
    expect(url).toContain("publickey=test-pub");
    expect(url).toContain("secretkey=test-sec");
  });
});

describe("get_project_info", () => {
  it("returns project info", async () => {
    const info = { id: "1", title: "My Site", customdomain: "example.com" };
    mockFetch.mockReturnValueOnce(okResponse(info));

    const out = await handleGetProjectInfo({ projectid: "1" });
    expect(JSON.parse(out)).toEqual(info);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("getprojectinfo");
    expect(url).toContain("projectid=1");
  });
});

describe("get_pages", () => {
  it("returns pages list", async () => {
    const pages = [{ id: "10", projectid: "1", title: "Home" }];
    mockFetch.mockReturnValueOnce(okResponse(pages));

    const out = await handleGetPages({ projectid: "1" });
    expect(JSON.parse(out)).toEqual(pages);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("getpageslist");
    expect(url).toContain("projectid=1");
  });
});

describe("get_page", () => {
  it("returns full page data", async () => {
    const page = { id: "10", title: "Home", html: "<h1>Hi</h1>", css: "", js: "" };
    mockFetch.mockReturnValueOnce(okResponse(page));

    const out = await handleGetPage({ pageid: "10" });
    expect(JSON.parse(out)).toEqual(page);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("getpagefull");
    expect(url).toContain("pageid=10");
  });
});

describe("get_page_export", () => {
  it("returns export data", async () => {
    const exp = { id: "10", title: "Home", html: "<h1>Hi</h1>", img: [] };
    mockFetch.mockReturnValueOnce(okResponse(exp));

    const out = await handleGetPageExport({ pageid: "10" });
    expect(JSON.parse(out)).toEqual(exp);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("getpagefullexport");
    expect(url).toContain("pageid=10");
  });
});

describe("auth errors", () => {
  it("throws when keys missing", async () => {
    delete process.env.TILDA_PUBLIC_KEY;
    delete process.env.TILDA_SECRET_KEY;
    await expect(handleGetProjects({})).rejects.toThrow("TILDA_PUBLIC_KEY");
  });
});

describe("API error handling", () => {
  it("throws on Tilda ERROR status", async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: "ERROR", message: "Invalid key" }),
      }),
    );
    await expect(handleGetProjects({})).rejects.toThrow("Invalid key");
  });
});
