// The server address is fixed when the client is built, from VITE_API_URL
// (for example https://my-server.onrender.com/api). It ends with /api.
export const API_URL: string = (
  import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
).replace(/\/+$/, "");

// A live site built without the setting would call the visitor's own computer
if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.error("VITE_API_URL was not set when this site was built.");
}

export const getToken = () => localStorage.getItem("token");
export const setToken = (token: string) => localStorage.setItem("token", token);
export const clearToken = () => localStorage.removeItem("token");

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (data.code === "ACCOUNT_INACTIVE") {
    window.dispatchEvent(new Event("auth:inactive"));
  }

  if (!res.ok) {
    // Server sends either { message } or { errors: { field: [msgs] } }
    const fieldErrors = data.errors
      ? (Object.values(data.errors).flat() as string[]).join(", ")
      : null;
    throw new Error(data.message ?? fieldErrors ?? "Something went wrong");
  }

  return data as T;
}
