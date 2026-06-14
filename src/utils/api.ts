import type {
  UploadImageResponse,
  DetectDefectsResponse,
  RepairRegionInput,
  RepairMode,
  RepairProgress,
  ImageRecord,
  ApiError,
} from '@/types';

const BASE_URL = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorData: ApiError | null = null;
    try {
      const parsed = await response.json();
      errorData = parsed.error || null;
    } catch {
      // ignore parse error
    }
    const message = errorData?.message || `请求失败: ${response.status}`;
    throw new Error(message);
  }

  const result = (await response.json()) as ApiResponse<T>;
  if (!result.success) {
    throw new Error(result.error?.message || '请求失败');
  }
  return result.data as T;
}

export async function uploadImage(
  file: File
): Promise<UploadImageResponse> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    let errorData: ApiError | null = null;
    try {
      const parsed = await response.json();
      errorData = parsed.error || null;
    } catch {
      // ignore parse error
    }
    const message = errorData?.message || `上传失败: ${response.status}`;
    throw new Error(message);
  }
  const result = (await response.json()) as ApiResponse<UploadImageResponse>;
  if (!result.success) {
    throw new Error(result.error?.message || '上传失败');
  }
  return result.data as UploadImageResponse;
}

export function detectDefects(
  imageId: string
): Promise<DetectDefectsResponse> {
  return request<DetectDefectsResponse>(`/images/${imageId}/detect`, {
    method: 'POST',
  });
}

export function startRepair(
  imageId: string,
  regions: RepairRegionInput[],
  mode?: RepairMode
): Promise<{ taskId: string }> {
  return request<{ taskId: string }>(`/images/${imageId}/repair`, {
    method: 'POST',
    body: JSON.stringify({ imageId, regions, mode }),
  });
}

export function subscribeProgress(
  taskId: string,
  callback: (progress: RepairProgress) => void
): () => void {
  const eventSource = new EventSource(`${BASE_URL}/tasks/${taskId}/progress`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as RepairProgress;
      callback(data);
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
  };

  return () => {
    eventSource.close();
  };
}

export function downloadImageUrl(
  imageId: string,
  format: 'png' | 'jpg' | 'webp' | 'tiff' = 'png',
  quality: number = 100,
  scale: number = 1,
  version?: number
): string {
  const params = new URLSearchParams({
    format,
    quality: String(quality),
    scale: String(scale),
  });
  if (version !== undefined && version > 0) {
    params.set('version', String(version));
  }
  return `${BASE_URL}/images/${imageId}/download?${params.toString()}`;
}

export function undoRepair(imageId: string): Promise<ImageRecord> {
  return request<ImageRecord>(`/images/${imageId}/undo`, {
    method: 'POST',
  });
}

export function getHistory(): Promise<ImageRecord[]> {
  return request<ImageRecord[]>('/images', {
    method: 'GET',
  });
}

export function deleteImage(imageId: string): Promise<void> {
  return request<void>(`/images/${imageId}`, {
    method: 'DELETE',
  });
}
