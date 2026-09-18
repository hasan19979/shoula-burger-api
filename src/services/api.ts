const API_URL = 'https://shoula-burger-api.onrender.com/api';

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean; // إذا true، بيرسل رمز الدخول (Bearer) — لازم للمسارات المحمية (كل التعديلات)
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.auth && authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // بعض المسارات (زي DELETE ناجح) ممكن ما ترجع body، ما هي مشكلة
  }

  if (!res.ok) {
    const message = (data as { error?: string })?.error || 'صار خطأ بالاتصال بالسيرفر';
    throw new ApiError(message, res.status);
  }
  return data as T;
}
