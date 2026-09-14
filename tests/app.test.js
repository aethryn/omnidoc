const axios = require("axios");

const app = axios.create({ baseURL: process.env.TEST_APP_URL || "http://localhost:3000", maxRedirects: 0, validateStatus: () => true });

describe("Google-only authentication", () => {
  test.each(["/signin", "/signup"])("%s renders the Google OAuth entry point", async (path) => {
    const response = await app.get(path);
    expect(response.status).toBe(200);
    expect(response.data).toContain("with Google");
  });

  test.each(["/api/auth/signup", "/api/auth/signin", "/api/auth/google"])("the retired password/custom OAuth route %s is absent", async (path) => {
    const response = await app.post(path, {});
    expect(response.status).toBe(404);
  });

  test.each(["/dashboard", "/document"])("%s requires a signed-in identity", async (path) => {
    const response = await app.get(path);
    expect([302, 307, 308]).toContain(response.status);
    expect(response.headers.location).toContain("/signin");
  });
});
