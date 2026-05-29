import type { AxiosError } from "axios";

type DownloadErrorBody = {
  detail?: string;
  message?: string;
  error?: string;
  folder_name?: string;
  min_achievable_mb?: number;
  ram_constrained?: boolean;
  retry_after_seconds?: number;
};

async function readErrorBody(data: unknown): Promise<DownloadErrorBody | null> {
  if (!data) return null;

  if (typeof data === "object" && !Array.isArray(data)) {
    return data as DownloadErrorBody;
  }

  if (data instanceof Blob) {
    const text = await data.text();
    if (!text.trim()) return null;

    try {
      return JSON.parse(text) as DownloadErrorBody;
    } catch {
      return { detail: text };
    }
  }

  if (typeof data === "string") {
    try {
      return JSON.parse(data) as DownloadErrorBody;
    } catch {
      return { detail: data };
    }
  }

  return null;
}

export async function getDownloadErrorContext(error: unknown): Promise<{
  folderName?: string;
  status?: number;
}> {
  const axiosError = error as AxiosError | undefined;
  const response = axiosError?.response;
  if (!response) return {};

  const body = await readErrorBody(response.data);
  return {
    folderName: body?.folder_name,
    status: response.status,
  };
}

function readableFallback(status?: number): string {
  if (status === 401 || status === 403) {
    return "Your session expired. Please sign in again.";
  }
  if (status === 413) {
    return "The download could not be compressed enough for the current limit.";
  }
  if (status === 503) {
    return "Compression service is busy. Your request is waiting for a free slot.";
  }
  if (status === 504) {
    return "Compression took too long. Please try again or download smaller sections.";
  }
  return "We could not complete the download. Please try again.";
}

export async function getReadableDownloadErrorMessage(error: unknown): Promise<string> {
  const axiosError = error as AxiosError | undefined;
  const response = axiosError?.response;
  const status = response?.status;

  if (!response) {
    return axiosError?.message || "We could not complete the download. Please try again.";
  }

  const body = await readErrorBody(response.data);

  if (body?.detail) return body.detail;
  if (body?.message) return body.message;

  if (status === 413 && typeof body?.min_achievable_mb === "number") {
    const floor = body.min_achievable_mb.toFixed(2);
    const folderLabel = body.folder_name ? `folder "${body.folder_name}"` : "this download";
    if (body.ram_constrained) {
      return `The ${folderLabel} cannot be compressed below ${floor} MB right now because the server is under heavy load. Please try again in a moment.`;
    }
    return `The ${folderLabel} stays at ${floor} MB even at maximum compression. Please try again with fewer files or a higher limit.`;
  }

  if (status === 503) {
    if (body?.error === "busy") {
      if (body.folder_name) {
        return `The compression queue is currently busy while processing folder "${body.folder_name}". Please retry in a moment.`;
      }
      return `Compression service is busy. Your request is waiting for a free slot and will continue automatically.`;
    }
    if (typeof body?.retry_after_seconds === "number") {
      return `Compression service is busy. Please retry in about ${body.retry_after_seconds} seconds.`;
    }
  }

  return readableFallback(status);
}
