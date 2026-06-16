import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import helmet from "helmet";
import crypto from "node:crypto";
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

const textInput = (min = 1, max = 120) => z.string().trim().min(min).max(max);
const passwordInput = z.string().min(4, "Heslo musí mít alespoň 4 znaky.").max(120);
const jarCountInput = z.coerce.number().int().min(1).max(10000);

const credentialsSchema = z.object({
  name: textInput(2, 80),
  password: passwordInput
});

const reservationSchema = credentialsSchema.extend({
  jarCount: jarCountInput
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
  return db.settings.upsert({
    where: { id: settingsId },
    update: {},
    create: { id: settingsId }
  });
}

async function applySettingsOverridesFromEnv(db: PrismaClient) {
  const overrides = settingsOverridesFromEnv();

  if (Object.keys(overrides).length === 0) {
    return;
  }

  await db.settings.upsert({
    where: { id: settingsId },
    update: overrides,
    create: { id: settingsId, ...overrides }
  });
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
    throw new HttpError(409, `Tolik sklenic už není volných. Dostupné množství: ${available}.`);
  }

  return settings;
}

async function verifyCustomer(name: string, password: string) {
  const customer = await prisma.customer.findUnique({
    where: { name },
    include: { orders: { orderBy: { createdAt: "desc" } } }
  });

  if (!customer || !(await bcrypt.compare(password, customer.passwordHash))) {
    throw new HttpError(401, "Jméno nebo heslo nesedí.");
  }

  return customer;
}

async function getOrCreateCustomerForUser(db: DbClient, name: string, password: string) {
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

function serializeOrder(order: Prisma.OrderGetPayload<{ include: { customer: true } }>) {
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

    url.searchParams.set("amount", String(amountCzk * 100));
    url.searchParams.set("currency", "CZK");
    return url.toString();
  } catch {
    return "";
  }
}

async function paymentForOrder(
  settings: Awaited<ReturnType<typeof ensureSettings>>,
  order: { id: string; jarCount: number },
  customerName: string
) {
  const amountCzk = order.jarCount * settings.pricePerJarCzk;
  const message = safePaymentText(`${settings.paymentMessage || "Med"} - ${customerName} - ${order.id.slice(0, 8)}`);
  const result: {
    amountCzk: number;
    variableSymbol: string;
    message: string;
    bankQr: string | null;
    bankPayload: string | null;
    revolutQr: string | null;
    revolutLink: string | null;
  } = {
    amountCzk,
    variableSymbol: order.id.replace(/\D/g, "").slice(0, 10) || order.id.slice(0, 10),
    message,
    bankQr: null,
    bankPayload: null,
    revolutQr: null,
    revolutLink: null
  };

  if (settings.iban) {
    const account = `${settings.iban.replace(/\s+/g, "")}${settings.swift ? `+${settings.swift.trim()}` : ""}`;
    const payload = [`SPD*1.0`, `ACC:${account}`, `AM:${amountCzk.toFixed(2)}`, `CC:CZK`, `MSG:${message}`].join("*");
    result.bankPayload = payload;
    result.bankQr = await QRCode.toDataURL(payload, { margin: 1, width: 320 });
  }

  const revolutInputs = [settings.revolutLink, settings.revolutUsername ? `https://revolut.me/${settings.revolutUsername}` : ""];
  for (const revolutInput of revolutInputs) {
    const revolutLink = revolutLinkWithAmount(revolutInput, amountCzk);
    if (revolutLink) {
      result.revolutLink = revolutLink;
      result.revolutQr = await QRCode.toDataURL(revolutLink, { margin: 1, width: 320 });
      break;
    }
  }

  return result;
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
    orders: orders.map(serializeOrder),
    customers: Array.from(customers.values()).sort((a, b) => b.lastOrderAt.getTime() - a.lastOrderAt.getTime())
  };
}

async function customerProfile(name: string, password: string) {
  const customer = await verifyCustomer(name, password);
  const settings = await ensureSettings(prisma);
  const payments = await Promise.all(
    customer.orders.map((order) => (order.status === "CANCELLED" ? Promise.resolve(null) : paymentForOrder(settings, order, customer.name)))
  );

  return {
    customer: { id: customer.id, name: customer.name },
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

const adminAuth: RequestHandler = (req, _res, next) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const provided = req.header("x-admin-password") ?? "";

  if (!adminPassword || provided !== adminPassword) {
    next(new HttpError(401, "Admin heslo nesedí."));
    return;
  }

  next();
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
    const input = reservationSchema.parse(req.body);

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

    res.status(201).json({
      order: serializeOrder(result.order),
      payment: await paymentForOrder(result.settings, result.order, result.customer.name),
      publicState: await publicState()
    });
  })
);

app.post(
  "/api/login",
  asyncRoute(async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    res.json(await customerProfile(input.name, input.password));
  })
);

app.post(
  "/api/profile/orders",
  asyncRoute(async (req, res) => {
    const input = reservationSchema.parse(req.body);

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

    res.status(201).json({
      order: serializeOrder(result.order),
      payment: await paymentForOrder(result.settings, result.order, result.customer.name),
      profile: await customerProfile(input.name, input.password),
      publicState: await publicState()
    });
  })
);

app.patch(
  "/api/profile/orders/:orderId",
  asyncRoute(async (req, res) => {
    const input = reservationSchema.parse(req.body);
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);

    const result = await prisma.$transaction(async (tx) => {
      const customer = await getOrCreateCustomerForUser(tx, input.name, input.password);
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { customer: true } });

      if (!order || order.customerId !== customer.id) {
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

      return { customer, order: updated, settings };
    });

    res.json({
      order: serializeOrder(result.order),
      payment: await paymentForOrder(result.settings, result.order, result.customer.name),
      profile: await customerProfile(input.name, input.password),
      publicState: await publicState()
    });
  })
);

app.delete(
  "/api/profile/orders/:orderId",
  asyncRoute(async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);
    const customer = await verifyCustomer(input.name, input.password);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });

    if (!order || order.customerId !== customer.id) {
      throw new HttpError(404, "Rezervace nebyla nalezena.");
    }

    if (order.status !== "PENDING") {
      throw new HttpError(409, "Potvrzenou rezervaci už může zrušit jen správce.");
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date() }
    });

    res.json({
      profile: await customerProfile(input.name, input.password),
      publicState: await publicState()
    });
  })
);

app.post(
  "/api/admin/login",
  adminAuth,
  asyncRoute(async (_req, res) => {
    res.json({ ok: true });
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

app.patch(
  "/api/admin/orders/:orderId",
  adminAuth,
  asyncRoute(async (req, res) => {
    const input = adminOrderUpdateSchema.parse(req.body);
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { customer: true } });

      if (!order) {
        throw new HttpError(404, "Rezervace nebyla nalezena.");
      }

      if (input.status !== "CANCELLED") {
        await assertCapacity(tx, input.jarCount, order.id);
      }

      const customer = await getOrCreateCustomerForAdmin(tx, input.name);
      return tx.order.update({
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
    });

    res.json({ order: serializeOrder(updated), publicState: await publicState() });
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

app.patch(
  "/api/admin/customers/:customerId/password",
  adminAuth,
  asyncRoute(async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    const { customerId } = z.object({ customerId: z.string().min(1) }).parse(req.params);
    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: { passwordHash: await bcrypt.hash(input.password, 12) },
      select: { id: true, name: true, createdAt: true }
    });

    res.json({ customer });
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
  await applySettingsOverridesFromEnv(prisma);

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
