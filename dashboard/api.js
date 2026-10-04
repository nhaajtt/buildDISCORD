// The only place that talks to the server. Every change carries the CSRF token that /api/me hands out.

let csrf = "";
const listeners = new Set();

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const onUnauthenticated = (fn) => listeners.add(fn);
export const setCsrf = (token) => {
  csrf = token;
};

export async function request(method, url, body) {
  const init = { method, credentials: "same-origin", headers: { Accept: "application/json" } };
  if (method !== "GET") {
    init.headers["Content-Type"] = "application/json";
    init.headers["X-CSRF-Token"] = csrf;
    init.body = JSON.stringify(body ?? {});
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, "Không kết nối được tới thầu. Kiểm tra mạng rồi thử lại.");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // an empty or non-JSON answer is handled below
  }
  if (res.status === 401) for (const fn of listeners) fn();
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "Có lỗi xảy ra, thử lại sau chút.");
  return data;
}

export const get = (url) => request("GET", url);
export const put = (url, body) => request("PUT", url, body);
export const post = (url, body) => request("POST", url, body);
export const del = (url) => request("DELETE", url);
