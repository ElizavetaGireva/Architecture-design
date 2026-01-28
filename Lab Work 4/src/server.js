import express from "express";

const app = express();
app.use(express.json());

const orders = new Map();   // orderId -> { id, userId, status, totalAmount }
const payments = new Map(); // paymentId -> { id, orderId, status, paymentUrl }

function jsonError(res, statusCode, message) {
  return res.status(statusCode).json({ error: message });
}

function generateId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

// --------------------
// 1) GET /api/v1/orders - список заказов
// --------------------
app.get("/api/v1/orders", (req, res) => {
  const { userId } = req.query;

  const list = Array.from(orders.values()).filter((o) =>
    userId ? o.userId === userId : true
  );

  return res.status(200).json(list);
});

// --------------------
// 2) GET /api/v1/orders/:id - заказ по id
// --------------------
app.get("/api/v1/orders/:id", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return jsonError(res, 404, "Заказ не найден");

  return res.status(200).json(order);
});

// --------------------
// 3) POST /api/v1/orders - создать заказ
// --------------------
app.post("/api/v1/orders", (req, res) => {
  const { userId, totalAmount } = req.body;

  if (!userId) return jsonError(res, 400, "userId обязателен");
  if (typeof totalAmount !== "number" || totalAmount <= 0) {
    return jsonError(res, 400, "totalAmount должен быть числом > 0");
  }

  const id = generateId("order");
  const order = {
    id,
    userId,
    status: "CREATED",
    totalAmount,
  };

  orders.set(id, order);
  return res.status(201).json(order);
});

// --------------------
// 4) POST /api/v1/payments - инициировать оплату заказа
// --------------------
app.post("/api/v1/payments", (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return jsonError(res, 400, "orderId обязателен");

  const order = orders.get(orderId);
  if (!order) return jsonError(res, 404, "Заказ не найден");

  if (order.status !== "CREATED") {
    return jsonError(res, 400, "Оплата доступна только для заказа со статусом CREATED");
  }

  const paymentId = generateId("pay");
  const paymentUrl = `https://payment.example.com/session/${paymentId}`;

  const payment = {
    id: paymentId,
    orderId,
    status: "PENDING",
    paymentUrl,
  };

  payments.set(paymentId, payment);

  orders.set(orderId, { ...order, status: "AWAITING_PAYMENT" });

  return res.status(200).json({ paymentUrl });
});

// --------------------
// 5) PUT /api/v1/orders/:id - обновить статус заказа
// --------------------
app.put("/api/v1/orders/:id", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return jsonError(res, 404, "Заказ не найден");

  const { status } = req.body;
  const allowed = ["CREATED", "AWAITING_PAYMENT", "PAID", "CANCELLED"];

  if (!allowed.includes(status)) {
    return jsonError(res, 400, `Недопустимый статус. Разрешено: ${allowed.join(", ")}`);
  }

  const updated = { ...order, status };
  orders.set(order.id, updated);

  return res.status(200).json({ id: updated.id, status: updated.status });
});

// --------------------
// 6) DELETE /api/v1/orders/:id - удалить заказ
// --------------------
app.delete("/api/v1/orders/:id", (req, res) => {
  const existed = orders.delete(req.params.id);
  if (!existed) return jsonError(res, 404, "Заказ не найден");

  return res.status(204).send();
});

// --------------------
// POST /api/v1/payments/webhook
// --------------------
app.post("/api/v1/payments/webhook", (req, res) => {
  const { paymentId, status } = req.body;
  if (!paymentId || !status) return jsonError(res, 400, "paymentId и status обязательны");

  const payment = payments.get(paymentId);
  if (!payment) return jsonError(res, 404, "Платёж не найден");

  if (!["SUCCESS", "FAILED"].includes(status)) {
    return jsonError(res, 400, "status должен быть SUCCESS или FAILED");
  }

  payments.set(paymentId, { ...payment, status });

  const order = orders.get(payment.orderId);
  if (order && status === "SUCCESS") {
    orders.set(order.id, { ...order, status: "PAID" });
  }

  return res.status(200).json({ ok: true });
});

app.listen(3000, () => {
  console.log("API started: http://localhost:3000");
});
