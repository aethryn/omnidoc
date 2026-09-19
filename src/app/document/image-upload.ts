"use client";

import { toast } from "sonner";

export type UploadedImage = { fileUrl: string; width?: number; height?: number; originalName?: string };
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function uploadDocumentImage(file: File, getDocumentId: () => Promise<string | null>): Promise<UploadedImage> {
  if (!allowed.has(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose a JPEG, PNG, WebP, or GIF up to 5 MB.");
  const documentId = await getDocumentId();
  if (!documentId) throw new Error("Save the document before adding an image.");
  const controller = new AbortController();
  const toastId = toast.loading(`Uploading ${file.name} · 0%`);
  try {
    return await new Promise<UploadedImage>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/images/upload");
      const cancel = () => controller.abort();
      controller.signal.addEventListener("abort", () => request.abort(), { once: true });
      toast.loading(`Uploading ${file.name} · 0%`, { id: toastId, action: { label: "Cancel", onClick: cancel } });
      request.upload.onprogress = (event) => { if (event.lengthComputable) { const progress = Math.round((event.loaded / event.total) * 100); toast.loading(`Uploading ${file.name} · ${progress}%`, { id: toastId, action: { label: "Cancel", onClick: cancel } }); } };
      request.onerror = () => reject(new Error("The image upload was interrupted."));
      request.onabort = () => reject(new Error("The image upload was cancelled."));
      request.onload = () => {
        let response: { error?: string } & Partial<UploadedImage> = {};
        try { response = JSON.parse(request.responseText); } catch { /* handled below */ }
        if (request.status >= 200 && request.status < 300 && response.fileUrl) resolve(response as UploadedImage);
        else reject(new Error(response.error || "The image could not be uploaded."));
      };
      const body = new FormData(); body.append("file", file); body.append("documentId", documentId); request.send(body);
    });
  } finally {
    toast.dismiss(toastId);
  }
}

export async function uploadAndInsertImage(file: File, getDocumentId: () => Promise<string | null>, insert: (image: UploadedImage) => void) {
  try {
    const image = await uploadDocumentImage(file, getDocumentId);
    insert(image);
    toast.success("Image added");
  } catch (error) {
    const message = error instanceof Error ? error.message : "The image could not be uploaded.";
    toast.error(message, { action: { label: "Retry", onClick: () => { void uploadAndInsertImage(file, getDocumentId, insert); } } });
  }
}

