Лабораторная работа №4  
## Тема: Проектирование REST API  

## Цель работы  
Получить опыт проектирования программного интерфейса (REST API) для информационной системы онлайн-магазина товаров и услуг в сфере кукольного творчества.

## Документация по API

В рамках лабораторной работы был спроектирован REST API для серверной части информационной системы онлайн-магазина кукольного творчества.  
API используется Web-приложением и обеспечивает взаимодействие с серверной бизнес-логикой при оформлении заказов и выполнении онлайн-оплаты.

## Принятые проектные решения при проектировании API

1. **Использование архитектурного стиля REST**  
API спроектирован в соответствии с принципами REST: используется клиент-серверная архитектура, стандартные HTTP-методы и статусы ответов.

2. **Использование HTTP-методов по назначению**  
Для работы с ресурсами применяются стандартные методы:
- **GET** — получение данных;
- **POST** — создание ресурсов;
- **PUT** — обновление ресурсов;
- **DELETE** — удаление ресурсов.

3. **Ресурсно-ориентированные URL**  
URI описывают сущности предметной области, а не действия:
- `/api/v1/orders`
- `/api/v1/orders/{id}`
- `/api/v1/payments`

4. **Использование формата JSON**  
Все данные в запросах и ответах передаются в формате **JSON**, так как он удобен для Web-приложений и легко расширяется.

5. **Версионирование API**  
Версия API указана в URL: /api/v1/
Это позволяет изменять и расширять API без нарушения обратной совместимости.

### 6. Использование стандартных HTTP-статусов  
API возвращает корректные статусы:
- `200 OK` — успешный запрос;
- `201 Created` — ресурс создан;
- `204 No Content` — ресурс удалён;
- `400 Bad Request` — ошибка запроса;
- `404 Not Found` — ресурс не найден;
- `500 Internal Server Error` — ошибка сервера.

### 7. Единый формат ошибок  
Ошибки возвращаются в стандартизированном виде:
```json
{
  "error": "Описание ошибки"
}
```
### 8. Идемпотентность операций
Методы GET, PUT и DELETE являются идемпотентными, а метод POST используется только для создания новых ресурсов.

## Тестирование

### POST /api/v1/orders — создание заказа

![POST /orders Body](/post_orders_body.png)
![POST /orders Tests](/post_orders_tests.png)

### GET /api/v1/orders/:id — получение заказа по ID

![GET /orders](/get_orders.png)

### PUT /api/v1/orders/:id — обновление статуса заказа

![PUT /orders Body](/put_orders_body.png)
![PUT /orders Tests](/put_orders_tests.png)

### DELETE /api/v1/orders/:id — удаление заказа

![DELETE /orders Tests](/delete_orders_tests.png)

### GET /api/v1/orders/:id — проверка, что заказ удалён (ожидаем 404)

![GET deleted order Tests](/get_deleted_order_tests.png)

### POST /api/v1/orders — создание заказа (для сценария оплаты)

![POST /orders Body](/post_orders_payment_body.png)
![POST /orders Tests](/post_orders_payment_tests.png)

### POST /api/v1/payments — инициирование оплаты заказа

![POST /payments Body](/post_payments_body.png)
![POST /payments Tests](/post_payments_tests.png)

### GET /api/v1/orders/:id — проверка статуса заказа после инициации оплаты

![GET /orders awaiting payment Tests](/get_order_awaiting_payment_tests.png)

### POST /api/v1/payments/webhook — подтверждение оплаты

![POST /payments/webhook Body](/post_payments_webhook_body.png)
![POST /payments/webhook Tests](/post_payments_webhook_tests.png)
