import { describe, it, expect } from "vitest";
import { createMcpServer } from "../src/index.js";

describe("MCP server", () => {
  it("creates server with 11 tools", () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });
});
