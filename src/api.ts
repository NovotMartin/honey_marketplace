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
  variableSymbol: string;
  message: string;
  bankQr: string | null;
  bankPayload: string | null;
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
  orders: Order[];
  customers: CustomerSummary[];
};

export type ProfileOrder = Order & { payment: Payment | null };

export type ProfileResponse = {
  customer: { id: string; name: string };
  orders: ProfileOrder[];
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
  return request<{ order: Order; payment: Payment; publicState: PublicState }>("/api/reservations", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function loginProfile(payload: { name: string; password: string }) {
  return request<ProfileResponse>("/api/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createProfileOrder(payload: { name: string; password: string; jarCount: number }) {
  return request<{ order: Order; payment: Payment; profile: ProfileResponse; publicState: PublicState }>("/api/profile/orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateProfileOrder(orderId: string, payload: { name: string; password: string; jarCount: number }) {
  return request<{ order: Order; payment: Payment; profile: ProfileResponse; publicState: PublicState }>(`/api/profile/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function cancelProfileOrder(orderId: string, payload: { name: string; password: string }) {
  return request<{ profile: ProfileResponse; publicState: PublicState }>(`/api/profile/orders/${orderId}`, {
    method: "DELETE",
    body: JSON.stringify(payload)
  });
}

export function adminLogin(password: string) {
  return request<{ ok: true }>("/api/admin/login", {
    method: "POST",
    headers: { "x-admin-password": password },
    body: JSON.stringify({})
  });
}

export function getAdminDashboard(password: string) {
  return request<AdminDashboard>("/api/admin/dashboard", {
    headers: { "x-admin-password": password }
  });
}

export function saveAdminSettings(password: string, payload: Omit<AdminSettings, "id" | "updatedAt">) {
  return request<{ settings: AdminSettings; publicState: PublicState }>("/api/admin/settings", {
    method: "PATCH",
    headers: { "x-admin-password": password },
    body: JSON.stringify(payload)
  });
}

export function adminSendTestEmail(password: string, to: string) {
  return request<{ ok: true; message: string; mailSettings: MailSettings }>("/api/admin/email/test", {
    method: "POST",
    headers: { "x-admin-password": password },
    body: JSON.stringify({ to })
  });
}

export function adminCreateOrder(
  password: string,
  payload: { name: string; jarCount: number; password?: string; confirmed: boolean }
) {
  return request<{ order: Order; publicState: PublicState }>("/api/admin/orders", {
    method: "POST",
    headers: { "x-admin-password": password },
    body: JSON.stringify(payload)
  });
}

export function adminUpdateOrder(
  password: string,
  orderId: string,
  payload: { name: string; jarCount: number; status: OrderStatus; source: OrderSource }
) {
  return request<{ order: Order; publicState: PublicState }>(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    headers: { "x-admin-password": password },
    body: JSON.stringify(payload)
  });
}

export function adminConfirmOrder(password: string, orderId: string) {
  return request<{ order: Order; publicState: PublicState }>(`/api/admin/orders/${orderId}/confirm`, {
    method: "PATCH",
    headers: { "x-admin-password": password },
    body: JSON.stringify({})
  });
}

export function adminCancelOrder(password: string, orderId: string) {
  return request<{ order: Order; publicState: PublicState }>(`/api/admin/orders/${orderId}/cancel`, {
    method: "PATCH",
    headers: { "x-admin-password": password },
    body: JSON.stringify({})
  });
}

export function adminResetPassword(password: string, customerId: string, newPassword: string) {
  return request<{ customer: { id: string; name: string; createdAt: string } }>(`/api/admin/customers/${customerId}/password`, {
    method: "PATCH",
    headers: { "x-admin-password": password },
    body: JSON.stringify({ password: newPassword })
  });
}
