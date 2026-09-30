import { supabase } from "@/integrations/supabase/client";

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png"];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("invalid_image"));
    };
    img.src = url;
  });
}

/** Validates file type, size and that it decodes to an image with sensible dimensions. Returns an error message or null. */
export async function validateImageFile(file: File, maxBytes = RECEIPT_MAX_BYTES): Promise<string | null> {
  const nameOk = /\.(jpe?g|png)$/i.test(file.name);
  if (!ACCEPTED.includes(file.type) || !nameOk) return "Please upload a valid JPG or PNG receipt.";
  if (file.size > maxBytes) return `File is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  if (file.size < 1024) return "This file looks empty or corrupted. Please choose another image.";
  try {
    const img = await loadImage(file);
    if (img.naturalWidth < 200 || img.naturalHeight < 200) return "This image is too small to read. Please upload a clearer receipt.";
    if (img.naturalWidth > 12000 || img.naturalHeight > 12000) return "This image's dimensions are too large. Please upload a smaller image.";
  } catch {
    return "Please upload a valid JPG or PNG receipt.";
  }
  return null;
}

/** Downscale to a readable size and re-encode as JPEG. Keeps the original if compression wouldn't help. */
export async function compressImage(file: File, maxDim = 2000, quality = 0.82): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob || blob.size >= file.size) return file;
  return blob;
}

/** Uploads to private storage with real byte-level progress from the network request. */
export async function uploadWithProgress(bucket: string, path: string, body: Blob, onProgress: (pct: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not_authenticated");
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", body.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload_failed_${xhr.status}`)));
    xhr.onerror = () => reject(new Error("upload_network_error"));
    xhr.send(body);
  });
}

export async function signedUrl(bucket: string, path: string, expiresIn = 300) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
