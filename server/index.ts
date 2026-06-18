import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import helmet from "helmet";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
import { z } from "zod";

dotenv.config({ quiet: true });

const prisma = new PrismaClient();
const app = express();
const settingsId = 1;

type DbClient = PrismaClient | Prisma.TransactionClient;
type OrderWithCustomer = Prisma.OrderGetPayload<{ include: { customer: true } }>;
type CustomerWithOrders = Prisma.CustomerGetPayload<{ include: { orders: true } }>;
type CustomerSessionRecord = { id: string; customerId: string; tokenHash: string; createdAt: Date; lastUsedAt: Date; revokedAt: Date | null };
type CustomerSessionDelegate = {
  create(options: { data: { customerId: string; tokenHash: string; lastUsedAt?: Date } }): Promise<CustomerSessionRecord>;
  findUnique(options: {
    where: { tokenHash: string };
    include?: { customer?: { include?: { orders?: { orderBy?: { createdAt: "desc" } } } } };
  }): Promise<(CustomerSessionRecord & { customer: CustomerWithOrders }) | null>;
  update(options: { where: { id: string }; data: Partial<Pick<CustomerSessionRecord, "lastUsedAt" | "revokedAt">> }): Promise<CustomerSessionRecord>;
  updateMany(options: { where: { customerId?: string; tokenHash?: string; revokedAt?: null }; data: { revokedAt?: Date; lastUsedAt?: Date } }): Promise<unknown>;
};
type MailTransport = { sendMail(options: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown> };
type NodemailerModule = {
  createTransport?: (options: Record<string, unknown>) => MailTransport;
  default?: { createTransport?: (options: Record<string, unknown>) => MailTransport };
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const asyncRoute = (handler: RequestHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

type RateLimitBucket = { count: number; resetAt: number };

const rateLimits = new Map<string, RateLimitBucket>();

function clientIp(req: Request) {
  const forwardedFor = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || req.ip || req.socket.remoteAddress || "unknown";
}

function assertRateLimit(req: Request, bucket: string, limit: number, windowMs: number, message: string) {
  const now = Date.now();
  const key = `${bucket}:${clientIp(req)}`;
  const current = rateLimits.get(key);

  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  current.count += 1;

  if (current.count > limit) {
    throw new HttpError(429, message);
  }
}

const textInput = (min = 1, max = 120) => z.string().trim().min(min).max(max);
const passwordInput = z.string().min(4, "Heslo musí mít alespoň 4 znaky.").max(120);
const jarCountInput = z.coerce.number().int().min(1).max(10000);

const credentialsSchema = z.object({
  name: textInput(2, 80),
  password: passwordInput
});

const reservationSchema = credentialsSchema.extend({
  jarCount: jarCountInput,
  website: z.string().trim().max(200).optional().default(""),
  formStartedAt: z.coerce.number().int()
});

const settingsSchema = z.object({
  totalJars: z.coerce.number().int().min(0).max(100000),
  pricePerJarCzk: z.coerce.number().int().min(0).max(100000),
  iban: z.string().trim().max(80).optional().default(""),
  swift: z.string().trim().max(40).optional().default(""),
  revolutUsername: z.string().trim().max(80).optional().default(""),
  revolutLink: z.string().trim().max(300).optional().default(""),
  paymentMessage: z.string().trim().max(140).optional().default("Platba za med")
});

const adminOrderSchema = z.object({
  name: textInput(2, 80),
  jarCount: jarCountInput,
  password: z.string().max(120).optional(),
  confirmed: z.boolean().optional().default(true)
});

const adminOrderUpdateSchema = z.object({
  name: textInput(2, 80),
  jarCount: jarCountInput,
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED"]),
  source: z.enum(["USER", "ADMIN"])
});

const resetPasswordSchema = z.object({
  password: passwordInput
});

const testEmailSchema = z.object({
  to: z.string().trim().email("Zadej platnou e-mailovou adresu.").max(254)
});

const sharedPaymentParamsSchema = z.object({
  orderId: z.string().min(1),
  token: z.string().trim().min(1).max(200)
});

type SettingsEnvOverrides = Partial<
  Pick<
    Prisma.SettingsUncheckedCreateInput,
    "totalJars" | "pricePerJarCzk" | "iban" | "swift" | "revolutUsername" | "revolutLink" | "paymentMessage"
  >
>;

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function adminUsername() {
  return optionalEnv("ADMIN_USERNAME") ?? "admin";
}

function sameLoginName(left: string, right: string) {
  return left.trim().toLocaleLowerCase("cs-CZ") === right.trim().toLocaleLowerCase("cs-CZ");
}

function isAdminName(name: string) {
  return sameLoginName(name, adminUsername());
}

function optionalIntEnv(name: string) {
  const value = optionalEnv(name);

  if (value === undefined) {
    return undefined;
  }

  const parsed = z.coerce.number().int().min(0).max(100000).safeParse(value);

  if (!parsed.success) {
    throw new Error(`${name} musí být celé číslo od 0 do 100000.`);
  }

  return parsed.data;
}

function optionalBooleanEnv(name: string) {
  const value = optionalEnv(name);

  if (value === undefined) {
    return undefined;
  }

  if (["1", "true", "yes", "ano"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "ne"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${name} musí být true/false.`);
}

function mailSettingsFromEnv() {
  const port = optionalIntEnv("SMTP_PORT") ?? 465;
  const secure = optionalBooleanEnv("SMTP_SECURE") ?? port === 465;
  const host = optionalEnv("SMTP_HOST") ?? "";
  const user = optionalEnv("SMTP_USER") ?? "";
  const password = optionalEnv("SMTP_PASSWORD") ?? "";
  const from = optionalEnv("SMTP_FROM") ?? user;
  const adminEmail = optionalEnv("ADMIN_EMAIL") ?? "";
  const appPublicUrl = (optionalEnv("APP_PUBLIC_URL") ?? "").replace(/\/+$/, "");
  const actionSecret = optionalEnv("ADMIN_ACTION_SECRET") ?? "";
  const confirmLinkTtlHours = optionalIntEnv("ADMIN_CONFIRM_LINK_TTL_HOURS") ?? 72;
  const missing = [
    ["SMTP_HOST", host],
    ["SMTP_USER", user],
    ["SMTP_PASSWORD", password],
    ["SMTP_FROM", from],
    ["ADMIN_EMAIL", adminEmail],
    ["APP_PUBLIC_URL", appPublicUrl],
    ["ADMIN_ACTION_SECRET", actionSecret]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return {
    enabled: missing.length === 0,
    missing,
    host,
    port,
    secure,
    user,
    password,
    from,
    adminEmail,
    appPublicUrl,
    actionSecret,
    confirmLinkTtlHours,
    hasPassword: Boolean(password),
    hasActionSecret: Boolean(actionSecret)
  };
}

function publicMailSettings() {
  const settings = mailSettingsFromEnv();

  return {
    enabled: settings.enabled,
    missing: settings.missing,
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    user: settings.user,
    from: settings.from,
    adminEmail: settings.adminEmail,
    appPublicUrl: settings.appPublicUrl,
    confirmLinkTtlHours: settings.confirmLinkTtlHours,
    hasPassword: settings.hasPassword,
    hasActionSecret: settings.hasActionSecret
  };
}

function settingsOverridesFromEnv(): SettingsEnvOverrides {
  const overrides: SettingsEnvOverrides = {};
  const totalJars = optionalIntEnv("HONEY_TOTAL_JARS");
  const pricePerJarCzk = optionalIntEnv("HONEY_PRICE_PER_JAR_CZK");

  if (totalJars !== undefined) {
    overrides.totalJars = totalJars;
  }

  if (pricePerJarCzk !== undefined) {
    overrides.pricePerJarCzk = pricePerJarCzk;
  }

  const stringEnvMap = {
    iban: "HONEY_IBAN",
    swift: "HONEY_SWIFT",
    revolutUsername: "HONEY_REVOLUT_USERNAME",
    revolutLink: "HONEY_REVOLUT_LINK",
    paymentMessage: "HONEY_PAYMENT_MESSAGE"
  } as const;

  for (const [field, envName] of Object.entries(stringEnvMap)) {
    const value = optionalEnv(envName);

    if (value !== undefined) {
      overrides[field as keyof typeof stringEnvMap] = value;
    }
  }

  return overrides;
}

function assertHumanReservation(input: z.infer<typeof reservationSchema>) {
  if (input.website) {
    throw new HttpError(400, "Rezervace se nepovedla.");
  }

  const ageMs = Date.now() - input.formStartedAt;

  if (ageMs < 2_000) {
    throw new HttpError(400, "Formulář byl odeslán příliš rychle. Zkus to prosím znovu.");
  }

  if (ageMs > 86_400_000 || ageMs < 0) {
    throw new HttpError(400, "Formulář je zastaralý. Obnov stránku a zkus to prosím znovu.");
  }
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"]
      }
    }
  })
);
app.use(cors());
app.use(express.json({ limit: "1mb" }));

async function ensureSettings(db: DbClient) {
  const existing = await db.settings.findUnique({ where: { id: settingsId } });

  if (existing) {
    return existing;
  }

  return db.settings.create({ data: { id: settingsId, ...settingsOverridesFromEnv() } });
}

async function activeJarCount(db: DbClient, excludeOrderId?: string) {
  const where: Prisma.OrderWhereInput = { status: { not: "CANCELLED" } };

  if (excludeOrderId) {
    where.id = { not: excludeOrderId };
  }

  const result = await db.order.aggregate({
    where,
    _sum: { jarCount: true }
  });

  return result._sum.jarCount ?? 0;
}

async function assertCapacity(db: DbClient, jarCount: number, excludeOrderId?: string) {
  const settings = await ensureSettings(db);
  const activeJars = await activeJarCount(db, excludeOrderId);

  if (activeJars + jarCount > settings.totalJars) {
    const available = Math.max(settings.totalJars - activeJars, 0);
    throw new HttpError(409, `Tolik sklenic už není volných. Dostupné množství: ${formatJarCountText(available)}.`);
  }

  return settings;
}

async function verifyCustomer(name: string, password: string) {
  if (isAdminName(name)) {
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword || password !== adminPassword) {
      throw new HttpError(401, "Jméno nebo heslo nesedí.");
    }

    const adminCustomer = await getOrCreateCustomerForAdmin(prisma, adminUsername());
    const customer = await prisma.customer.findUnique({
      where: { id: adminCustomer.id },
      include: { orders: { orderBy: { createdAt: "desc" } } }
    });

    if (!customer) {
      throw new HttpError(404, "Admin profil nebyl nalezen.");
    }

    return customer;
  }

  const customer = await prisma.customer.findUnique({
    where: { name },
    include: { orders: { orderBy: { createdAt: "desc" } } }
  });

  if (!customer || !(await bcrypt.compare(password, customer.passwordHash))) {
    throw new HttpError(401, "Jméno nebo heslo nesedí.");
  }

  return customer;
}

function customerSessions(db: DbClient) {
  return (db as unknown as { customerSession: CustomerSessionDelegate }).customerSession;
}

function sessionTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createCustomerSession(db: DbClient, customerId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  await customerSessions(db).create({ data: { customerId, tokenHash: sessionTokenHash(token), lastUsedAt: new Date() } });
  return token;
}

function bearerToken(req: Request) {
  const header = req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

async function customerFromSession(req: Request) {
  const token = bearerToken(req);

  if (!token) {
    throw new HttpError(401, "Přihlášení vypršelo nebo chybí.");
  }

  const session = await customerSessions(prisma).findUnique({
    where: { tokenHash: sessionTokenHash(token) },
    include: { customer: { include: { orders: { orderBy: { createdAt: "desc" } } } } }
  });

  if (!session || session.revokedAt) {
    throw new HttpError(401, "Přihlášení vypršelo. Přihlas se znovu.");
  }

  await customerSessions(prisma).update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
  return { customer: session.customer, token };
}

async function revokeCustomerSessions(customerId: string) {
  await customerSessions(prisma).updateMany({ where: { customerId, revokedAt: null }, data: { revokedAt: new Date() } });
}

async function getOrCreateCustomerForUser(db: DbClient, name: string, password: string) {
  if (isAdminName(name)) {
    throw new HttpError(403, `Jméno ${adminUsername()} je vyhrazené pro admina. Přihlas se přes Můj med.`);
  }

  const existing = await db.customer.findUnique({ where: { name } });

  if (existing) {
    if (!(await bcrypt.compare(password, existing.passwordHash))) {
      throw new HttpError(401, "Toto jméno už existuje. Zadej správné heslo nebo použij jiné jméno.");
    }

    return existing;
  }

  return db.customer.create({
    data: {
      name,
      passwordHash: await bcrypt.hash(password, 12)
    }
  });
}

async function getOrCreateCustomerForAdmin(db: DbClient, name: string, password?: string) {
  const existing = await db.customer.findUnique({ where: { name } });

  if (existing) {
    return existing;
  }

  return db.customer.create({
    data: {
      name,
      passwordHash: await bcrypt.hash(password && password.length >= 4 ? password : crypto.randomUUID(), 12)
    }
  });
}

function publicSettings(settings: Awaited<ReturnType<typeof ensureSettings>>) {
  return {
    totalJars: settings.totalJars,
    pricePerJarCzk: settings.pricePerJarCzk,
    hasBankPayment: Boolean(settings.iban),
    hasRevolutPayment: Boolean(settings.revolutLink || settings.revolutUsername),
    revolutUsername: settings.revolutUsername
  };
}

function serializeOrder(order: OrderWithCustomer) {
  return {
    id: order.id,
    customerId: order.customerId,
    customerName: order.customer.name,
    jarCount: order.jarCount,
    status: order.status,
    source: order.source,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    cancelledAt: order.cancelledAt
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoneyText(value: number) {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);
}

const jarPluralRules = new Intl.PluralRules("cs-CZ");

function formatJarCountText(count: number) {
  return `${count} ${jarPluralRules.select(count) === "other" ? "sklenic" : "sklenice"}`;
}

function formatDateText(value: Date) {
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function adminActionToken(orderId: string, expires: number, secret: string) {
  return crypto.createHmac("sha256", secret).update(`${orderId}.${expires}`).digest("hex");
}

function verifyAdminActionToken(orderId: string, expires: number, token: string, secret: string) {
  const expected = adminActionToken(orderId, expires, secret);
  const expectedBuffer = Buffer.from(expected, "hex");
  const tokenBuffer = Buffer.from(token, "hex");

  return expectedBuffer.length === tokenBuffer.length && crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
}

function paymentShareToken(orderId: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(`payment-share.${orderId}`).digest("hex");
}

function verifyPaymentShareToken(orderId: string, token: string, secret: string) {
  const expectedBuffer = Buffer.from(paymentShareToken(orderId, secret), "hex");
  const tokenBuffer = Buffer.from(token, "hex");
  return expectedBuffer.length === tokenBuffer.length && crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
}

function publicBaseUrl(req: Request) {
  return (optionalEnv("APP_PUBLIC_URL") ?? `${req.protocol}://${req.get("host") ?? "localhost"}`).replace(/\/+$/, "");
}

function paymentShareUrl(req: Request, orderId: string) {
  const secret = optionalEnv("ADMIN_ACTION_SECRET");

  if (!secret) {
    throw new HttpError(400, "Chybí ADMIN_ACTION_SECRET pro veřejné sdílení platby.");
  }

  return `${publicBaseUrl(req)}/platba/${encodeURIComponent(orderId)}/${paymentShareToken(orderId, secret)}`;
}

function adminConfirmUrl(orderId: string) {
  const settings = mailSettingsFromEnv();

  if (!settings.enabled) {
    return "";
  }

  const expires = Math.floor(Date.now() / 1000) + settings.confirmLinkTtlHours * 60 * 60;
  const token = adminActionToken(orderId, expires, settings.actionSecret);
  return `${settings.appPublicUrl}/api/admin/orders/${encodeURIComponent(orderId)}/email-confirm?expires=${expires}&token=${token}`;
}

function adminActionHtmlPage(title: string, message: string, action?: { href: string; label: string }) {
  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8c657; color: #1c1917; font-family: Arial, sans-serif; }
      main { max-width: 42rem; margin: 1rem; padding: 2rem; border-radius: 2rem; background: rgba(255, 255, 255, 0.88); box-shadow: 0 1.5rem 4rem rgba(120, 53, 15, 0.25); }
      h1 { margin: 0 0 1rem; font-size: 2rem; }
      p { margin: 0; font-size: 1.1rem; line-height: 1.6; }
      a { display: inline-flex; margin-top: 1.5rem; border-radius: 1rem; background: #1c1917; color: white; padding: 0.85rem 1.25rem; font-weight: 800; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${action ? `<a href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>` : ""}
    </main>
  </body>
</html>`;
}

function safePaymentText(value: string, max = 60) {
  return value.replace(/[\r\n*]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function extractPaymentUrl(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/https?:\/\/[^\s<>"']+|(?:www\.)?revolut\.me\/[^\s<>"']+/i);
  const candidate = match?.[0] ?? trimmed;
  return candidate.replace(/[),.;!?]+$/, "");
}

function revolutLinkWithAmount(linkOrText: string, amountCzk: number) {
  const link = extractPaymentUrl(linkOrText);

  if (!link) {
    return "";
  }

  try {
    const url = new URL(link.startsWith("http") ? link : `https://${link}`);

    if (!/^https?:$/.test(url.protocol)) {
      return "";
    }

    if (url.hostname.replace(/^www\./i, "").toLowerCase() !== "revolut.me") {
      return "";
    }

    url.search = "";
    url.searchParams.set("t", "rq");
    url.searchParams.set("amount", String(amountCzk * 100));
    url.searchParams.set("currency", "CZK");
    return url.toString();
  } catch {
    return "";
  }
}

function paymentBase(
  settings: Awaited<ReturnType<typeof ensureSettings>>,
  order: { id: string; jarCount: number },
  customerName: string
) {
  const amountCzk = order.jarCount * settings.pricePerJarCzk;
  const message = safePaymentText(`${settings.paymentMessage || "Med"} - ${customerName} - ${order.id.slice(0, 8)}`);
  const bankPayload = settings.iban
    ? [
        `SPD*1.0`,
        `ACC:${settings.iban.replace(/\s+/g, "")}${settings.swift ? `+${settings.swift.trim()}` : ""}`,
        `AM:${amountCzk.toFixed(2)}`,
        `CC:CZK`,
        `MSG:${message}`
      ].join("*")
    : "";
  const revolutInputs = [settings.revolutLink, settings.revolutUsername ? `https://revolut.me/${settings.revolutUsername}` : ""];
  const revolutLink = revolutInputs.map((input) => revolutLinkWithAmount(input, amountCzk)).find(Boolean) ?? "";

  return { amountCzk, message, bankPayload, revolutLink };
}

async function paymentForOrder(
  settings: Awaited<ReturnType<typeof ensureSettings>>,
  order: { id: string; jarCount: number },
  customerName: string
) {
  const { amountCzk, message, bankPayload, revolutLink } = paymentBase(settings, order, customerName);
  const result: {
    amountCzk: number;
    message: string;
    bankQr: string | null;
    revolutQr: string | null;
    revolutLink: string | null;
  } = {
    amountCzk,
    message,
    bankQr: null,
    revolutQr: null,
    revolutLink: null
  };

  if (bankPayload) {
    result.bankQr = await QRCode.toDataURL(bankPayload, { margin: 1, width: 320 });
  }

  if (revolutLink) {
    result.revolutLink = revolutLink;
    result.revolutQr = await QRCode.toDataURL(revolutLink, { margin: 1, width: 320 });
  }

  return result;
}

async function sharedPaymentPayload(order: OrderWithCustomer, req?: Request) {
  const settings = await ensureSettings(prisma);

  return {
    order: serializeOrder(order),
    payment: await paymentForOrder(settings, order, order.customer.name),
    shareUrl: req ? paymentShareUrl(req, order.id) : undefined
  };
}

async function sharedPaymentQrPng(order: OrderWithCustomer) {
  const settings = await ensureSettings(prisma);
  const { bankPayload, revolutLink } = paymentBase(settings, order, order.customer.name);
  const qrText = bankPayload || revolutLink;

  if (!qrText) {
    throw new HttpError(404, "Pro tuhle objednávku nejsou nastavené platební údaje.");
  }

  return QRCode.toBuffer(qrText, { margin: 2, width: 900 });
}

async function sharedPaymentFromParams(orderId: string, token: string) {
  const secret = optionalEnv("ADMIN_ACTION_SECRET");

  if (!secret || !verifyPaymentShareToken(orderId, token, secret)) {
    throw new HttpError(404, "Sdílená platba nebyla nalezena.");
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });

  if (!order) {
    throw new HttpError(404, "Sdílená platba nebyla nalezena.");
  }

  return order;
}

async function sharedPaymentHtml(req: Request, order: OrderWithCustomer) {
  const settings = await ensureSettings(prisma);
  const url = paymentShareUrl(req, order.id);
  const title = `Platba za med - ${order.customer.name}`;
  const description = `${formatJarCountText(order.jarCount)}, ${formatMoneyText(order.jarCount * settings.pricePerJarCzk)}`;
  const image = `${url}/og.png`;
  const meta = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />`;

  const indexHtml = await fs.readFile(path.join(clientDist, "index.html"), "utf8").catch(() => "");

  if (indexHtml) {
    return indexHtml.replace("<head>", `<head>${meta}`);
  }

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    ${meta}
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`;
}

async function sendMail(options: { to: string; subject: string; text: string; html: string }) {
  const settings = mailSettingsFromEnv();

  if (!settings.enabled) {
    throw new HttpError(400, `E-mail není kompletně nastavený. Chybí: ${settings.missing.join(", ")}.`);
  }

  const nodemailerModuleName = "nodemailer";
  const nodemailer = (await import(nodemailerModuleName)) as NodemailerModule;
  const createTransport = nodemailer.createTransport ?? nodemailer.default?.createTransport;

  if (!createTransport) {
    throw new HttpError(500, "Balíček nodemailer není dostupný.");
  }

  const transporter = createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.user,
      pass: settings.password
    }
  });

  await transporter.sendMail({
    from: settings.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html
  });
}

async function sendOrderNotificationEmail(order: OrderWithCustomer, settings: Awaited<ReturnType<typeof ensureSettings>>) {
  const mailSettings = mailSettingsFromEnv();

  if (!mailSettings.enabled) {
    console.warn(`E-mail notifikace není nastavená. Chybí: ${mailSettings.missing.join(", ")}.`);
    return;
  }

  const amount = order.jarCount * settings.pricePerJarCzk;
  const confirmUrl = adminConfirmUrl(order.id);
  const jarCountText = formatJarCountText(order.jarCount);
  const subject = `Nová objednávka medu: ${order.customer.name} (${jarCountText})`;
  const text = [
    `Nová webová objednávka medu`,
    `Jméno: ${order.customer.name}`,
    `Množství: ${jarCountText}`,
    `Částka: ${formatMoneyText(amount)}`,
    `Vytvořeno: ${formatDateText(order.createdAt)}`,
    `Potvrdit objednávku: ${confirmUrl}`
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1c1917; line-height: 1.5;">
      <h1 style="margin: 0 0 16px;">Nová objednávka medu</h1>
      <p><strong>Jméno:</strong> ${escapeHtml(order.customer.name)}</p>
      <p><strong>Množství:</strong> ${escapeHtml(jarCountText)}</p>
      <p><strong>Částka:</strong> ${escapeHtml(formatMoneyText(amount))}</p>
      <p><strong>Vytvořeno:</strong> ${escapeHtml(formatDateText(order.createdAt))}</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(confirmUrl)}" style="display: inline-block; border-radius: 999px; background: #059669; color: #ffffff; font-weight: 800; padding: 14px 22px; text-decoration: none;">Potvrdit objednávku</a>
      </p>
      <p style="color: #57534e; font-size: 13px;">Odkaz je časově omezený a neobsahuje admin heslo.</p>
    </div>`;

  try {
    await sendMail({ to: mailSettings.adminEmail, subject, text, html });
  } catch (error) {
    console.error("Nepodařilo se odeslat e-mailovou notifikaci objednávky.", error);
  }
}

async function sendOrderUpdateEmail(
  order: OrderWithCustomer,
  settings: Awaited<ReturnType<typeof ensureSettings>>,
  previousJarCount: number
) {
  const mailSettings = mailSettingsFromEnv();

  if (!mailSettings.enabled) {
    console.warn(`E-mail notifikace není nastavená. Chybí: ${mailSettings.missing.join(", ")}.`);
    return;
  }

  const amount = order.jarCount * settings.pricePerJarCzk;
  const confirmUrl = adminConfirmUrl(order.id);
  const previousJarCountText = formatJarCountText(previousJarCount);
  const jarCountText = formatJarCountText(order.jarCount);
  const subject = `Upravená objednávka medu: ${order.customer.name} (${previousJarCountText} → ${jarCountText})`;
  const text = [
    `Upravená webová objednávka medu`,
    `Jméno: ${order.customer.name}`,
    `Původní množství: ${previousJarCountText}`,
    `Nové množství: ${jarCountText}`,
    `Nová částka: ${formatMoneyText(amount)}`,
    `Upraveno: ${formatDateText(order.updatedAt)}`,
    `Potvrdit objednávku: ${confirmUrl}`
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1c1917; line-height: 1.5;">
      <h1 style="margin: 0 0 16px;">Upravená objednávka medu</h1>
      <p><strong>Jméno:</strong> ${escapeHtml(order.customer.name)}</p>
      <p><strong>Původní množství:</strong> ${escapeHtml(previousJarCountText)}</p>
      <p><strong>Nové množství:</strong> ${escapeHtml(jarCountText)}</p>
      <p><strong>Nová částka:</strong> ${escapeHtml(formatMoneyText(amount))}</p>
      <p><strong>Upraveno:</strong> ${escapeHtml(formatDateText(order.updatedAt))}</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(confirmUrl)}" style="display: inline-block; border-radius: 999px; background: #059669; color: #ffffff; font-weight: 800; padding: 14px 22px; text-decoration: none;">Potvrdit objednávku</a>
      </p>
      <p style="color: #57534e; font-size: 13px;">Odkaz je časově omezený a neobsahuje admin heslo.</p>
    </div>`;

  try {
    await sendMail({ to: mailSettings.adminEmail, subject, text, html });
  } catch (error) {
    console.error("Nepodařilo se odeslat e-mailovou notifikaci úpravy objednávky.", error);
  }
}

async function sendOrderCancellationEmail(
  order: OrderWithCustomer,
  settings: Awaited<ReturnType<typeof ensureSettings>>,
  cancelledBy: "uživatel" | "správce"
) {
  const mailSettings = mailSettingsFromEnv();

  if (!mailSettings.enabled) {
    console.warn(`E-mail notifikace není nastavená. Chybí: ${mailSettings.missing.join(", ")}.`);
    return;
  }

  const amount = order.jarCount * settings.pricePerJarCzk;
  const jarCountText = formatJarCountText(order.jarCount);
  const subject = `Zrušená rezervace medu: ${order.customer.name} (${jarCountText})`;
  const text = [
    `Zrušená rezervace medu`,
    `Jméno: ${order.customer.name}`,
    `Množství: ${jarCountText}`,
    `Částka: ${formatMoneyText(amount)}`,
    `Vytvořeno: ${formatDateText(order.createdAt)}`,
    `Zrušeno: ${formatDateText(order.cancelledAt ?? new Date())}`,
    `Zrušil: ${cancelledBy}`
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1c1917; line-height: 1.5;">
      <h1 style="margin: 0 0 16px;">Zrušená rezervace medu</h1>
      <p><strong>Jméno:</strong> ${escapeHtml(order.customer.name)}</p>
      <p><strong>Množství:</strong> ${escapeHtml(jarCountText)}</p>
      <p><strong>Částka:</strong> ${escapeHtml(formatMoneyText(amount))}</p>
      <p><strong>Vytvořeno:</strong> ${escapeHtml(formatDateText(order.createdAt))}</p>
      <p><strong>Zrušeno:</strong> ${escapeHtml(formatDateText(order.cancelledAt ?? new Date()))}</p>
      <p><strong>Zrušil:</strong> ${escapeHtml(cancelledBy)}</p>
    </div>`;

  try {
    await sendMail({ to: mailSettings.adminEmail, subject, text, html });
  } catch (error) {
    console.error("Nepodařilo se odeslat e-mailovou notifikaci zrušení objednávky.", error);
  }
}

async function sendTestEmail(to: string) {
  const subject = "Test e-mailu z aplikace Domácí med";
  const text = "Testovací e-mail byl úspěšně odeslán z aplikace Domácí med.";
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1c1917; line-height: 1.5;">
      <h1>Test e-mailu</h1>
      <p>Testovací e-mail byl úspěšně odeslán z aplikace <strong>Domácí med</strong>.</p>
    </div>`;

  await sendMail({ to, subject, text, html });
}

async function publicState() {
  const settings = await ensureSettings(prisma);
  const orders = await prisma.order.findMany({
    where: { status: { not: "CANCELLED" } },
    include: { customer: true },
    orderBy: { createdAt: "desc" }
  });

  const totalReservedJars = orders.reduce((sum, order) => sum + order.jarCount, 0);
  const customers = new Map<
    string,
    { name: string; activeJarCount: number; pendingJarCount: number; confirmedJarCount: number; lastOrderAt: Date }
  >();

  for (const order of orders) {
    const current = customers.get(order.customer.name) ?? {
      name: order.customer.name,
      activeJarCount: 0,
      pendingJarCount: 0,
      confirmedJarCount: 0,
      lastOrderAt: order.createdAt
    };
    current.activeJarCount += order.jarCount;
    current.lastOrderAt = current.lastOrderAt > order.createdAt ? current.lastOrderAt : order.createdAt;

    if (order.status === "CONFIRMED") {
      current.confirmedJarCount += order.jarCount;
    } else {
      current.pendingJarCount += order.jarCount;
    }

    customers.set(order.customer.name, current);
  }

  return {
    settings: publicSettings(settings),
    totalReservedJars,
    availableJars: Math.max(settings.totalJars - totalReservedJars, 0),
    customers: Array.from(customers.values()).sort((a, b) => b.lastOrderAt.getTime() - a.lastOrderAt.getTime())
  };
}

async function customerProfileForCustomer(customer: CustomerWithOrders) {
  const settings = await ensureSettings(prisma);
  const payments = await Promise.all(
    customer.orders.map((order) => (order.status === "CANCELLED" ? Promise.resolve(null) : paymentForOrder(settings, order, customer.name)))
  );

  return {
    customer: { id: customer.id, name: customer.name, isAdmin: isAdminName(customer.name) },
    orders: customer.orders.map((order, index) => ({
      id: order.id,
      customerId: customer.id,
      customerName: customer.name,
      jarCount: order.jarCount,
      status: order.status,
      source: order.source,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      cancelledAt: order.cancelledAt,
      payment: payments[index]
    }))
  };
}

async function customerProfileById(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { orders: { orderBy: { createdAt: "desc" } } }
  });

  if (!customer) {
    throw new HttpError(404, "Profil nebyl nalezen.");
  }

  return customerProfileForCustomer(customer);
}

const adminAuth: RequestHandler = (req, _res, next) => {
  Promise.resolve(customerFromSession(req))
    .then(({ customer }) => {
      if (!isAdminName(customer.name)) {
        throw new HttpError(403, "Tahle část je jen pro admina.");
      }

      next();
    })
    .catch(next);
};

app.get(
  "/api/public",
  asyncRoute(async (_req, res) => {
    res.json(await publicState());
  })
);

app.post(
  "/api/reservations",
  asyncRoute(async (req, res) => {
    assertRateLimit(req, "reservation", 5, 10 * 60_000, "Příliš mnoho rezervací z jedné adresy. Zkus to prosím později.");
    const input = reservationSchema.parse(req.body);
    assertHumanReservation(input);

    const result = await prisma.$transaction(async (tx) => {
      const customer = await getOrCreateCustomerForUser(tx, input.name, input.password);
      const settings = await assertCapacity(tx, input.jarCount);
      const order = await tx.order.create({
        data: {
          customerId: customer.id,
          jarCount: input.jarCount,
          status: "PENDING",
          source: "USER"
        },
        include: { customer: true }
      });

      return { customer, order, settings };
    });

    await sendOrderNotificationEmail(result.order, result.settings);
    const sessionToken = await createCustomerSession(prisma, result.customer.id);

    res.status(201).json({
      order: serializeOrder(result.order),
      payment: await paymentForOrder(result.settings, result.order, result.customer.name),
      profile: await customerProfileById(result.customer.id),
      sessionToken,
      publicState: await publicState()
    });
  })
);

app.post(
  "/api/login",
  asyncRoute(async (req, res) => {
    assertRateLimit(req, "login", 10, 10 * 60_000, "Příliš mnoho pokusů o přihlášení. Zkus to za pár minut.");
    const input = credentialsSchema.parse(req.body);
    const customer = await verifyCustomer(input.name, input.password);
    res.json({ ...(await customerProfileForCustomer(customer)), sessionToken: await createCustomerSession(prisma, customer.id) });
  })
);

app.get(
  "/api/profile/me",
  asyncRoute(async (req, res) => {
    const { customer } = await customerFromSession(req);
    res.json(await customerProfileForCustomer(customer));
  })
);

app.post(
  "/api/logout",
  asyncRoute(async (req, res) => {
    const token = bearerToken(req);

    if (token) {
      await customerSessions(prisma).updateMany({ where: { tokenHash: sessionTokenHash(token), revokedAt: null }, data: { revokedAt: new Date() } });
    }

    res.json({ ok: true });
  })
);

app.post(
  "/api/profile/orders",
  asyncRoute(async (req, res) => {
    const input = z.object({ jarCount: jarCountInput }).parse(req.body);
    const { customer: sessionCustomer } = await customerFromSession(req);

    const result = await prisma.$transaction(async (tx) => {
      const settings = await assertCapacity(tx, input.jarCount);
      const order = await tx.order.create({
        data: {
          customerId: sessionCustomer.id,
          jarCount: input.jarCount,
          status: "PENDING",
          source: "USER"
        },
        include: { customer: true }
      });

      return { customer: sessionCustomer, order, settings };
    });

    await sendOrderNotificationEmail(result.order, result.settings);

    res.status(201).json({
      order: serializeOrder(result.order),
      payment: await paymentForOrder(result.settings, result.order, result.customer.name),
      profile: await customerProfileById(result.customer.id),
      publicState: await publicState()
    });
  })
);

app.patch(
  "/api/profile/orders/:orderId",
  asyncRoute(async (req, res) => {
    const input = z.object({ jarCount: jarCountInput }).parse(req.body);
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);
    const { customer: sessionCustomer } = await customerFromSession(req);

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { customer: true } });

      if (!order || order.customerId !== sessionCustomer.id) {
        throw new HttpError(404, "Rezervace nebyla nalezena.");
      }

      if (order.status !== "PENDING") {
        throw new HttpError(409, "Potvrzenou nebo zrušenou rezervaci už nejde upravit.");
      }

      const settings = await assertCapacity(tx, input.jarCount, order.id);
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { jarCount: input.jarCount },
        include: { customer: true }
      });

      return { customer: sessionCustomer, order: updated, previousJarCount: order.jarCount, settings };
    });

    if (result.previousJarCount !== result.order.jarCount) {
      await sendOrderUpdateEmail(result.order, result.settings, result.previousJarCount);
    }

    res.json({
      order: serializeOrder(result.order),
      payment: await paymentForOrder(result.settings, result.order, result.customer.name),
      profile: await customerProfileById(result.customer.id),
      publicState: await publicState()
    });
  })
);

app.delete(
  "/api/profile/orders/:orderId",
  asyncRoute(async (req, res) => {
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);
    const { customer } = await customerFromSession(req);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });

    if (!order || order.customerId !== customer.id) {
      throw new HttpError(404, "Rezervace nebyla nalezena.");
    }

    if (order.status !== "PENDING") {
      throw new HttpError(409, "Potvrzenou rezervaci už může zrušit jen správce.");
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      include: { customer: true }
    });
    await sendOrderCancellationEmail(updated, await ensureSettings(prisma), "uživatel");

    res.json({
      profile: await customerProfileById(customer.id),
      publicState: await publicState()
    });
  })
);

app.get(
  "/api/admin/dashboard",
  adminAuth,
  asyncRoute(async (_req, res) => {
    const settings = await ensureSettings(prisma);
    const orders = await prisma.order.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" }
    });
    const activeJars = await activeJarCount(prisma);

    res.json({
      settings,
      mailSettings: publicMailSettings(),
      orders: orders.map(serializeOrder),
      customers: await prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, createdAt: true } }),
      totals: {
        activeJars,
        availableJars: Math.max(settings.totalJars - activeJars, 0)
      }
    });
  })
);

app.patch(
  "/api/admin/settings",
  adminAuth,
  asyncRoute(async (req, res) => {
    const input = settingsSchema.parse(req.body);
    const settings = await prisma.settings.upsert({
      where: { id: settingsId },
      update: input,
      create: { id: settingsId, ...input }
    });

    res.json({ settings, publicState: await publicState() });
  })
);

app.post(
  "/api/admin/email/test",
  adminAuth,
  asyncRoute(async (req, res) => {
    const input = testEmailSchema.parse(req.body);

    try {
      await sendTestEmail(input.to);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      console.error("Testovací e-mail se nepodařilo odeslat.", error);
      throw new HttpError(502, `Testovací e-mail se nepodařilo odeslat: ${error instanceof Error ? error.message : "neznámá chyba"}.`);
    }

    res.json({ ok: true, message: `Testovací e-mail byl odeslán na ${input.to}.`, mailSettings: publicMailSettings() });
  })
);

app.post(
  "/api/admin/orders",
  adminAuth,
  asyncRoute(async (req, res) => {
    const input = adminOrderSchema.parse(req.body);

    const order = await prisma.$transaction(async (tx) => {
      const customer = await getOrCreateCustomerForAdmin(tx, input.name, input.password);
      await assertCapacity(tx, input.jarCount);

      return tx.order.create({
        data: {
          customerId: customer.id,
          jarCount: input.jarCount,
          status: input.confirmed ? "CONFIRMED" : "PENDING",
          source: "ADMIN"
        },
        include: { customer: true }
      });
    });

    res.status(201).json({ order: serializeOrder(order), publicState: await publicState() });
  })
);

app.post(
  "/api/admin/orders/:orderId/payment-share",
  adminAuth,
  asyncRoute(async (req, res) => {
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });

    if (!order) {
      throw new HttpError(404, "Objednávka nebyla nalezena.");
    }

    res.json(await sharedPaymentPayload(order, req));
  })
);

app.patch(
  "/api/admin/orders/:orderId",
  adminAuth,
  asyncRoute(async (req, res) => {
    const input = adminOrderUpdateSchema.parse(req.body);
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { customer: true } });

      if (!order) {
        throw new HttpError(404, "Rezervace nebyla nalezena.");
      }

      if (input.status !== "CANCELLED") {
        await assertCapacity(tx, input.jarCount, order.id);
      }

      const customer = await getOrCreateCustomerForAdmin(tx, input.name);
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          customerId: customer.id,
          jarCount: input.jarCount,
          status: input.status,
          source: input.source,
          cancelledAt: input.status === "CANCELLED" ? (order.cancelledAt ?? new Date()) : null
        },
        include: { customer: true }
      });

      return updated;
    });

    res.json({ order: serializeOrder(result), publicState: await publicState() });
  })
);

app.get(
  "/api/admin/orders/:orderId/email-confirm",
  asyncRoute(async (req, res) => {
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);
    const query = z
      .object({
        expires: z.coerce.number().int(),
        token: z.string().trim().min(1).max(200)
      })
      .safeParse(req.query);

    if (!query.success) {
      res.status(400).send(adminActionHtmlPage("Neplatný odkaz", "Odkaz pro potvrzení objednávky nemá správný formát."));
      return;
    }

    const mailSettings = mailSettingsFromEnv();

    if (!mailSettings.actionSecret) {
      res.status(400).send(adminActionHtmlPage("Chybí token", "Na serveru není nastavený ADMIN_ACTION_SECRET."));
      return;
    }

    if (query.data.expires < Math.floor(Date.now() / 1000)) {
      res.status(400).send(adminActionHtmlPage("Odkaz vypršel", "Odkaz pro potvrzení objednávky už není platný."));
      return;
    }

    if (!verifyAdminActionToken(orderId, query.data.expires, query.data.token, mailSettings.actionSecret)) {
      res.status(400).send(adminActionHtmlPage("Neplatný odkaz", "Podpis odkazu pro potvrzení objednávky nesedí."));
      return;
    }

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });

    if (!order) {
      res.status(404).send(adminActionHtmlPage("Objednávka nenalezena", "Objednávka už neexistuje."));
      return;
    }

    if (order.status === "CANCELLED") {
      res.status(409).send(adminActionHtmlPage("Objednávka je zrušená", "Zrušenou objednávku nejde potvrdit z e-mailu."));
      return;
    }

    const updated = await prisma.order.update({ where: { id: order.id }, data: { status: "CONFIRMED", cancelledAt: null }, include: { customer: true } });
    res.send(
      adminActionHtmlPage(
        "Objednávka potvrzena",
        `Objednávka pro ${updated.customer.name} na ${formatJarCountText(updated.jarCount)} je potvrzená.`,
        { href: `${mailSettings.appPublicUrl}/objednavky`, label: "Otevřít objednávky" }
      )
    );
  })
);

app.patch(
  "/api/admin/orders/:orderId/confirm",
  adminAuth,
  asyncRoute(async (req, res) => {
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });

    if (!order || order.status === "CANCELLED") {
      throw new HttpError(404, "Rezervace nebyla nalezena.");
    }

    const updated = await prisma.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" }, include: { customer: true } });
    res.json({ order: serializeOrder(updated), publicState: await publicState() });
  })
);

app.patch(
  "/api/admin/orders/:orderId/cancel",
  adminAuth,
  asyncRoute(async (req, res) => {
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });

    if (!order) {
      throw new HttpError(404, "Rezervace nebyla nalezena.");
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      include: { customer: true }
    });

    res.json({ order: serializeOrder(updated), publicState: await publicState() });
  })
);

app.delete(
  "/api/admin/orders/:orderId",
  adminAuth,
  asyncRoute(async (req, res) => {
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new HttpError(404, "Rezervace nebyla nalezena.");
    }

    if (order.status !== "CANCELLED") {
      throw new HttpError(409, "Úplně smazat jde jen zrušenou objednávku.");
    }

    await prisma.order.delete({ where: { id: order.id } });
    res.json({ ok: true, publicState: await publicState() });
  })
);

app.patch(
  "/api/admin/customers/:customerId/password",
  adminAuth,
  asyncRoute(async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    const { customerId } = z.object({ customerId: z.string().min(1) }).parse(req.params);
    const existing = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } });

    if (!existing) {
      throw new HttpError(404, "Zákazník nebyl nalezen.");
    }

    if (isAdminName(existing.name)) {
      throw new HttpError(409, "Admin heslo se mění v env proměnné ADMIN_PASSWORD.");
    }

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: { passwordHash: await bcrypt.hash(input.password, 12) },
      select: { id: true, name: true, createdAt: true }
    });
    await revokeCustomerSessions(customer.id);

    res.json({ customer });
  })
);

app.get(
  "/api/payments/shared/:orderId/:token",
  asyncRoute(async (req, res) => {
    const { orderId, token } = sharedPaymentParamsSchema.parse(req.params);
    const order = await sharedPaymentFromParams(orderId, token);
    res.json(await sharedPaymentPayload(order, req));
  })
);

app.get(
  ["/api/payments/shared/:orderId/:token/og.png", "/platba/:orderId/:token/og.png"],
  asyncRoute(async (req, res) => {
    const { orderId, token } = sharedPaymentParamsSchema.parse(req.params);
    const order = await sharedPaymentFromParams(orderId, token);
    const buffer = await sharedPaymentQrPng(order);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(buffer);
  })
);

app.get(
  "/platba/:orderId/:token",
  asyncRoute(async (req, res) => {
    const { orderId, token } = sharedPaymentParamsSchema.parse(req.params);
    const order = await sharedPaymentFromParams(orderId, token);
    res.send(await sharedPaymentHtml(req, order));
  })
);

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    res.sendFile(path.join(clientDist, "index.html"));
    return;
  }

  next();
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: error.issues[0]?.message ?? "Neplatná data." });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Něco se pokazilo na serveru." });
});

const port = Number(process.env.PORT ?? 3000);

async function start() {
  await ensureSettings(prisma);

  app.listen(port, () => {
    console.log(`Honey marketplace API běží na http://localhost:${port}`);
  });
}

void start().catch((error) => {
  console.error("Nepodařilo se inicializovat aplikaci.", error);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
