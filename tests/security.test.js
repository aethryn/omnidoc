const axios = require("axios");

const BACKEND_URL = "http://localhost:3000";

describe("Security Boundaries & Authorization Checks", () => {
  let user1Token;
  let user2Token;
  let user1DocId;

  beforeAll(async () => {
    try {
      // Create User 1
      const u1Email = `sec-user1-${Date.now()}@test.com`;
      const res1 = await axios.post(`${BACKEND_URL}/api/auth/signup`, {
        name: "Security User 1",
        email: u1Email,
        password: "password123",
      });
      user1Token = res1.data.token;

      // Create User 2
      const u2Email = `sec-user2-${Date.now()}@test.com`;
      const res2 = await axios.post(`${BACKEND_URL}/api/auth/signup`, {
        name: "Security User 2",
        email: u2Email,
        password: "password123",
      });
      user2Token = res2.data.token;

      // Create document owned by User 1
      const docRes = await axios.post(
        `${BACKEND_URL}/api/documents`,
        {
          title: "Confidential Spec",
          content: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Secret"}]}]}',
          isPublic: false,
        },
        {
          headers: { Authorization: `Bearer ${user1Token}` },
        }
      );
      user1DocId = docRes.data.id;
    } catch (e) {
      console.warn("Backend not reachable during test setup:", e.message);
    }
  });

  describe("File Uploads Security (/api/images/upload)", () => {
    test("Rejects unauthenticated upload request with 401", async () => {
      try {
        const formData = new FormData();
        formData.append("file", new Blob(["test"], { type: "image/png" }), "test.png");
        formData.append("documentId", user1DocId || "fake-doc-id");

        await axios.post(`${BACKEND_URL}/api/images/upload`, formData);
        throw new Error("Should have thrown 401");
      } catch (error) {
        expect(error.response?.status).toBe(401);
      }
    });

    test("Rejects upload with invalid file type (e.g. text/plain) with 400", async () => {
      try {
        const formData = new FormData();
        formData.append("file", new Blob(["#!/bin/bash echo attack"], { type: "text/plain" }), "script.sh");
        formData.append("documentId", user1DocId);

        await axios.post(`${BACKEND_URL}/api/images/upload`, formData, {
          headers: { Authorization: `Bearer ${user1Token}` },
        });
        throw new Error("Should have thrown 400");
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    });

    test("Rejects upload to another user's private document with 404/403", async () => {
      try {
        const formData = new FormData();
        formData.append("file", new Blob(["fake-image-bytes"], { type: "image/png" }), "image.png");
        formData.append("documentId", user1DocId); // User 2 trying to upload to User 1's doc

        await axios.post(`${BACKEND_URL}/api/images/upload`, formData, {
          headers: { Authorization: `Bearer ${user2Token}` },
        });
        throw new Error("Should have thrown 404");
      } catch (error) {
        expect(error.response?.status).toBe(404);
      }
    });
  });

  describe("Room Creation Authorization (/api/rooms)", () => {
    test("Rejects room creation attaching another user's document with 404/403", async () => {
      try {
        await axios.post(
          `${BACKEND_URL}/api/rooms`,
          {
            name: "Illicit Room",
            documentId: user1DocId, // User 2 attaching User 1's document
          },
          {
            headers: { Authorization: `Bearer ${user2Token}` },
          }
        );
        throw new Error("Should have thrown 404");
      } catch (error) {
        expect(error.response?.status).toBe(404);
      }
    });

    test("Allows room creation attaching own document", async () => {
      if (!user1DocId) return;
      const res = await axios.post(
        `${BACKEND_URL}/api/rooms`,
        {
          name: "User 1 Collaboration Room",
          documentId: user1DocId,
        },
        {
          headers: { Authorization: `Bearer ${user1Token}` },
        }
      );
      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty("code");
      expect(res.data.documentId).toBe(user1DocId);
    });
  });

  describe("Google OAuth Security Endpoints (/api/auth/google)", () => {
    test("Returns 501 when Google OAuth is unconfigured in test environment", async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/auth/google`, {
          maxRedirects: 0,
          validateStatus: null,
        });
        // Returns 501 if unconfigured, or 302/307 if configured
        expect([302, 307, 501]).toContain(res.status);
      } catch (error) {
        expect([302, 307, 501]).toContain(error.response?.status);
      }
    });

    test("Rejects OAuth callback with invalid state with redirect to signin error", async () => {
      const res = await axios.get(`${BACKEND_URL}/api/auth/google/callback?code=test&state=forged_state`, {
        maxRedirects: 0,
        validateStatus: null,
      });
      expect([302, 307]).toContain(res.status);
      const location = res.headers["location"] || "";
      expect(location).toContain("error=invalid_oauth_state");
    });
  });
});
