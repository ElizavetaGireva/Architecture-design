import express from "express";
import { randomUUID } from "crypto";
import { query } from "./db.js";

const app = express();
app.use(express.json());

function jsonError(res, statusCode, message) {
  return res.status(statusCode).json({ error: message });
}

function generateId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

// healthcheck для Docker/CI
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

app.get("/", (req, res) => {
  res.status(200).send("Backend API is running. Use /health and /api/v1/*");
});

// --------------------
// 1) GET /api/v1/orders - список заказов
// --------------------
app.get("/api/v1/orders", async (req, res) => {
  try {
    const { userId } = req.query;

    const sql = userId
      ? `SELECT id, user_id as "userId", status, total_amount as "totalAmount"
         FROM orders WHERE user_id = $1 ORDER BY created_at DESC`
      : `SELECT id, user_id as "userId", status, total_amount as "totalAmount"
         FROM orders ORDER BY created_at DESC`;

    const result = userId ? await query(sql, [userId]) : await query(sql);
    return res.status(200).json(result.rows);
  } catch (e) {
    console.error(e);
    return jsonError(res, 500, "Ошибка сервера");
  }
});

// --------------------
// 2) GET /api/v1/orders/:id - заказ по id
// --------------------
app.get("/api/v1/orders/:id", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, user_id as "userId", status, total_amount as "totalAmount"
       FROM orders WHERE id = $1`,
      [req.params.id]
    );

    if (result.rowCount === 0) return jsonError(res, 404, "Заказ не найден");
    return res.status(200).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    return jsonError(res, 500, "Ошибка сервера");
  }
});

// --------------------
// 3) POST /api/v1/orders - создать заказ
// --------------------
app.post("/api/v1/orders", async (req, res) => {
  try {
    const { userId, totalAmount } = req.body;

    if (!userId) return jsonError(res, 400, "userId обязателен");
    if (typeof totalAmount !== "number" || totalAmount <= 0) {
      return jsonError(res, 400, "totalAmount должен быть числом > 0");
    }

    const id = generateId("order");
    const status = "CREATED";

    await query(
      `INSERT INTO orders (id, user_id, status, total_amount)
       VALUES ($1, $2, $3, $4)`,
      [id, userId, status, totalAmount]
    );

    return res.status(201).json({ id, userId, status, totalAmount });
  } catch (e) {
    console.error(e);
    return jsonError(res, 500, "Ошибка сервера");
  }
});

// --------------------
// 4) POST /api/v1/payments - инициировать оплату заказа
// --------------------
app.post("/api/v1/payments", async (req, res) => {
  const client = await (await import("./db.js")).pool.connect();
  try {
    const { orderId } = req.body;
    if (!orderId) return jsonError(res, 400, "orderId обязателен");

    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT id, status, total_amount as "totalAmount"
       FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return jsonError(res, 404, "Заказ не найден");
    }

    const order = orderRes.rows[0];
    if (order.status !== "CREATED") {
      await client.query("ROLLBACK");
      return jsonError(res, 400, "Оплата доступна только для заказа со статусом CREATED");
    }

    const paymentId = generateId("pay");
    const paymentUrl = `https://payment.example.com/session/${paymentId}`;

    await client.query(
      `INSERT INTO payments (id, order_id, status, payment_url)
       VALUES ($1, $2, $3, $4)`,
      [paymentId, orderId, "PENDING", paymentUrl]
    );

    await client.query(
      `UPDATE orders SET status = $1 WHERE id = $2`,
      ["AWAITING_PAYMENT", orderId]
    );

    await client.query("COMMIT");

    // ВАЖНО: возвращаем и url, и paymentId (удобно для webhook-теста)
    return res.status(200).json({ paymentUrl, paymentId });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    return jsonError(res, 500, "Ошибка сервера");
  } finally {
    client.release();
  }
});

// --------------------
// 5) PUT /api/v1/orders/:id - обновить статус заказа
// --------------------
app.put("/api/v1/orders/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["CREATED", "AWAITING_PAYMENT", "PAID", "CANCELLED"];

    if (!allowed.includes(status)) {
      return jsonError(res, 400, `Недопустимый статус. Разрешено: ${allowed.join(", ")}`);
    }

    const result = await query(
      `UPDATE orders SET status = $1 WHERE id = $2
       RETURNING id, status`,
      [status, req.params.id]
    );

    if (result.rowCount === 0) return jsonError(res, 404, "Заказ не найден");
    return res.status(200).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    return jsonError(res, 500, "Ошибка сервера");
  }
});

// --------------------
// 6) DELETE /api/v1/orders/:id - удалить заказ
// --------------------
app.delete("/api/v1/orders/:id", async (req, res) => {
  try {
    const result = await query(`DELETE FROM orders WHERE id = $1`, [req.params.id]);
    if (result.rowCount === 0) return jsonError(res, 404, "Заказ не найден");
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    return jsonError(res, 500, "Ошибка сервера");
  }
});

// --------------------
// 7) POST /api/v1/payments/webhook - подтверждение оплаты
// --------------------
app.post("/api/v1/payments/webhook", async (req, res) => {
  const client = await (await import("./db.js")).pool.connect();
  try {
    const { paymentId, status } = req.body;
    if (!paymentId || !status) return jsonError(res, 400, "paymentId и status обязательны");
    if (!["SUCCESS", "FAILED"].includes(status)) {
      return jsonError(res, 400, "status должен быть SUCCESS или FAILED");
    }

    await client.query("BEGIN");

    const payRes = await client.query(
      `SELECT id, order_id as "orderId" FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId]
    );
    if (payRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return jsonError(res, 404, "Платёж не найден");
    }

    const payment = payRes.rows[0];

    await client.query(
      `UPDATE payments SET status = $1 WHERE id = $2`,
      [status, paymentId]
    );

    if (status === "SUCCESS") {
      await client.query(
        `UPDATE orders SET status = $1 WHERE id = $2`,
        ["PAID", payment.orderId]
      );
    }

    await client.query("COMMIT");
    return res.status(200).json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    return jsonError(res, 500, "Ошибка сервера");
  } finally {
    client.release();
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API started: http://localhost:${port}`);
});
