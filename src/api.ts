export type OrderStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
export type OrderSource = "USER" | "ADMIN";

export type PublicSettings = {
  totalJars: number;
  pricePerJarCzk: number;
  hasBankPayment: boolean;
  hasRevolutPayment: boolean;
  revolutUsername: string;
};

export type Order = {
  id: string;
  customerId: string;
  customerName: string;
  jarCount: number;
  status: OrderStatus;
  source: OrderSource;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
};

export type Payment = {
  amountCzk: number;
  message: string;
  bankQr: string | null;
  revolutQr: string | null;
  revolutLink: string | null;
};

export type CustomerSummary = {
  name: string;
  activeJarCount: number;
  pendingJarCount: number;
  confirmedJarCount: number;
  lastOrderAt: string;
};

export type PublicState = {
  settings: PublicSettings;
  totalReservedJars: number;
  availableJars: number;
  customers: CustomerSummary[];
};

export type ProfileOrder = Order & { payment: Payment | null };

export type SharedPayment = {
  order: Order;
  payment: Payment;
  shareUrl: string;
};

export type ProfileResponse = {
  customer: { id: string; name: string; isAdmin: boolean };
  orders: ProfileOrder[];
};

export type AuthProfileResponse = ProfileResponse & {
  sessionToken: string;
};

export type AdminSettings = {
  id: number;
  totalJars: number;
  pricePerJarCzk: number;
  iban: string;
  swift: string;
  revolutUsername: string;
  revolutLink: string;
  paymentMessage: string;
  updatedAt: string;
};

export type MailSettings = {
  enabled: boolean;
  missing: string[];
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  adminEmail: string;
  appPublicUrl: string;
  confirmLinkTtlHours: number;
  hasPassword: boolean;
  hasActionSecret: boolean;
};

export type AdminDashboard = {
  settings: AdminSettings;
  mailSettings: MailSettings;
  orders: Order[];
  customers: Array<{ id: string; name: string; createdAt: string }>;
  totals: { activeJars: number; availableJars: number };
};

const apiBase = import.meta.env.VITE_API_BASE ?? "";

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message ?? "Požadavek se nepovedl.");
  }

  return data as T;
}

export function getPublicState() {
  return request<PublicState>("/api/public");
}

export function createReservation(payload: { name: string; password: string; jarCount: number }) {
  return request<{ order: Order; payment: Payment; profile: ProfileResponse; sessionToken: string; publicState: PublicState }>("/api/reservations", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function loginProfile(payload: { name: string; password: string }) {
  return request<AuthProfileResponse>("/api/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function bearerHeaders(sessionToken: string) {
  return { Authorization: `Bearer ${sessionToken}` };
}

export function getCurrentProfile(sessionToken: string) {
  return request<ProfileResponse>("/api/profile/me", {
    headers: bearerHeaders(sessionToken)
  });
}

export function logoutProfile(sessionToken: string) {
  return request<{ ok: true }>("/api/logout", {
    method: "POST",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify({})
  });
}

export function createProfileOrder(sessionToken: string, payload: { jarCount: number }) {
  return request<{ order: Order; payment: Payment; profile: ProfileResponse; publicState: PublicState }>("/api/profile/orders", {
    method: "POST",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify(payload)
  });
}

export function updateProfileOrder(sessionToken: string, orderId: string, payload: { jarCount: number }) {
  return request<{ order: Order; payment: Payment; profile: ProfileResponse; publicState: PublicState }>(`/api/profile/orders/${orderId}`, {
    method: "PATCH",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify(payload)
  });
}

export function cancelProfileOrder(sessionToken: string, orderId: string) {
  return request<{ profile: ProfileResponse; publicState: PublicState }>(`/api/profile/orders/${orderId}`, {
    method: "DELETE",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify({})
  });
}

export function getAdminDashboard(sessionToken: string) {
  return request<AdminDashboard>("/api/admin/dashboard", {
    headers: bearerHeaders(sessionToken)
  });
}

export function saveAdminSettings(sessionToken: string, payload: Omit<AdminSettings, "id" | "updatedAt">) {
  return request<{ settings: AdminSettings; publicState: PublicState }>("/api/admin/settings", {
    method: "PATCH",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify(payload)
  });
}

export function adminSendTestEmail(sessionToken: string, to: string) {
  return request<{ ok: true; message: string; mailSettings: MailSettings }>("/api/admin/email/test", {
    method: "POST",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify({ to })
  });
}

export function adminCreateOrder(
  sessionToken: string,
  payload: { name: string; jarCount: number; password?: string; confirmed: boolean }
) {
  return request<{ order: Order; publicState: PublicState }>("/api/admin/orders", {
    method: "POST",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify(payload)
  });
}

export function adminCreatePaymentShare(sessionToken: string, orderId: string) {
  return request<SharedPayment>(`/api/admin/orders/${orderId}/payment-share`, {
    method: "POST",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify({})
  });
}

export function getSharedPayment(orderId: string, token: string) {
  return request<SharedPayment>(`/api/payments/shared/${encodeURIComponent(orderId)}/${encodeURIComponent(token)}`);
}

export function adminUpdateOrder(
  sessionToken: string,
  orderId: string,
  payload: { name: string; jarCount: number; status: OrderStatus; source: OrderSource }
) {
  return request<{ order: Order; publicState: PublicState }>(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify(payload)
  });
}

export function adminConfirmOrder(sessionToken: string, orderId: string) {
  return request<{ order: Order; publicState: PublicState }>(`/api/admin/orders/${orderId}/confirm`, {
    method: "PATCH",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify({})
  });
}

export function adminCancelOrder(sessionToken: string, orderId: string) {
  return request<{ order: Order; publicState: PublicState }>(`/api/admin/orders/${orderId}/cancel`, {
    method: "PATCH",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify({})
  });
}

export function adminDeleteOrder(sessionToken: string, orderId: string) {
  return request<{ ok: true; publicState: PublicState }>(`/api/admin/orders/${orderId}`, {
    method: "DELETE",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify({})
  });
}

export function adminResetPassword(sessionToken: string, customerId: string, newPassword: string) {
  return request<{ customer: { id: string; name: string; createdAt: string } }>(`/api/admin/customers/${customerId}/password`, {
    method: "PATCH",
    headers: bearerHeaders(sessionToken),
    body: JSON.stringify({ password: newPassword })
  });
}
