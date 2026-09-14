"use client";

import { toast } from "sonner";

export type UploadedImage = { fileUrl: string; width?: number; height?: number; originalName?: string };
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function uploadDocumentImage(file: File, getDocumentId: () => Promise<string | null>): Promise<UploadedImage> {
  if (!allowed.has(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose a JPEG, PNG, WebP, or GIF up to 5 MB.");
  const documentId = await getDocumentId();
  if (!documentId) throw new Error("Save the document before adding an image.");
  const toastId = toast.loading(`Uploading ${file.name} · 0%`);
  try {
    return await new Promise<UploadedImage>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/images/upload");
      request.upload.onprogress = (event) => { if (event.lengthComputable) toast.loading(`Uploading ${file.name} · ${Math.round((event.loaded / event.total) * 100)}%`, { id: toastId }); };
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
    toast.error(error instanceof Error ? error.message : "The image could not be uploaded.");
  }
}

