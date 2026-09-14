const axios = require("axios");

const app = axios.create({ baseURL: process.env.TEST_APP_URL || "http://localhost:3000", maxRedirects: 0, validateStatus: () => true });

describe("authenticated product boundaries", () => {
  test.each([
    ["get", "/api/documents"],
    ["get", "/api/settings/ai"],
    ["post", "/api/ai/edit"],
  ])("%s %s rejects anonymous access", async (method, path) => {
    const response = await app.request({ method, url: path, data: { instruction: "rewrite", context: "text" } });
    expect(response.status).toBe(401);
  });

  test("an invite preserves its return path through Google sign-in", async () => {
    const response = await app.get("/join/not-a-real-token");
    expect([302, 307, 308]).toContain(response.status);
    expect(response.headers.location).toContain("redirect=");
  });
});
