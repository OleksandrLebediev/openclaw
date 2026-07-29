# DeepSeek — справочник по промтингу

Рабочий конспект: как писать промты, чтобы DeepSeek им следовал.
Обновлено: 2026-07-29. Модели: `deepseek-chat` (V3.2), `deepseek-reasoner`.

---

## 1. Формат сообщений

- API — OpenAI‑совместимый: `role: system | user | assistant`, `messages: [...]`.
- Base URL: `https://api.deepseek.com` (см. `extensions/deepseek/models.ts:3`).
- В сам текст промта **не пишите** служебные токены `<|...|>` / `<｜...｜>` —
  это внутренние токены chat‑template, применяются автоматически.
  Если модель их всё же протекает в ответ — они срезаются в
  `src/shared/text/model-special-tokens.ts:33`.

## 2. Универсальная структура промта

```
system:
  Ты <роль>. Отвечай <язык>. Формат: <краткое требование>.
  Правила:
    1. ...
    2. ...
  Запреты: ...

user:
  <context>
    ... входные данные ...
  </context>

  <task>
    Сделай X. Верни в формате Y.
    Проверь ответ перед выдачей.
  </task>
```

Ключевые приёмы:

- **Context first, instruction last.** DeepSeek привязывает директиву к
  ближайшему контенту. Ставьте команду **в конце** user‑сообщения, после
  данных.
- **XML‑теги как якоря:** `<context>`, `<task>`, `<output_format>`,
  `<examples>`, `<user_input>`. Модель обучена на такой разметке.
- **Оборачивайте пользовательский ввод** в `<user_input>...</user_input>` —
  снижает prompt injection.
- **Списки, не полотна.** Нумерованные пункты выполняются лучше сплошного
  текста.
- **Позитивные формулировки.** «Ответь одним абзацем» > «Не пиши много».
- **Дублируйте критичное** в начале system и в конце user (recency bias).
- **Одна роль на промт.** Смешение персон размывает поведение.
- **Не мешайте «объясни» и «сделай».** Разделяйте на шаги:
  `Step 1: Объясни подход`, отдельным сообщением `Step 2: Произведи результат`.
- **Verification directive** для кода/математики: «Покажи шаги и **проверь**
  финальный ответ до того, как его назвать».

## 3. `deepseek-chat` (V3.2)

Параметры и повадки:

- Контекст 131 072, max output 8 192 (`extensions/deepseek/models.ts:16`).
- Пресеты `temperature` (старая офиц. таблица, для V3.2 официально не
  переиздана — ориентир):
  - `0.0` — код, JSON, извлечение данных, детерминированные ответы.
  - `0.7` — обычный диалог, ассистент.
  - `1.0–1.3` — креатив, брейнсторм.
- `max_tokens` ставьте **явно**, иначе может обрезаться раньше времени.
- Поддерживает **function calling** (OpenAI‑совместимый tool use).
- **JSON mode:** `response_format: {type: "json_object"}`.
  - Обязательно упомяните слово «json» в промте.
  - Приложите точную схему и минимум один пример.
  - Без примера ломает типы или зацикливается на whitespace.
- **Prefix / FIM completion (beta):** можно передать последнее assistant‑
  сообщение с флагом `prefix: true` — модель дописывает от этого префикса.
  Годится для форсирования формата ответа.

Производительность V3.2 (sparse attention): TTFT ~320 мс, throughput
~68 т/с — не бойтесь стримить длинные промты.

## 4. `deepseek-reasoner` (R1‑style)

Отличия от chat, которые ломают код чаще всего:

- **Не передавайте** `temperature`, `top_p`, `presence_penalty`,
  `frequency_penalty`, `logprobs`, `top_logprobs` — API отклонит запрос.
- **Не пишите «think step by step»** — CoT и так идёт в `reasoning_content`.
- **`system` формально поддержан**, но в R1 слабее влияет; критичные
  инструкции кладите в `user`.
- **Мультитурн:** в истории `messages` кладите **только `content`** от
  предыдущих ассистент‑ответов. Если положите `reasoning_content` обратно —
  **400 error**.
- `max_tokens` относится к **финальному ответу**, не к CoT. Default 4K,
  максимум 8K.
- Контекст 64K (в OpenClaw каталоге стоит 131 072 —
  `extensions/deepseek/models.ts:32`, но провайдер официально даёт 64K для
  reasoner; уточнять при использовании).
- `reasoning_content` **не считается** против 64K контекста.
- Есть параметр `reasoning_effort` (управляет длиной CoT, значения обычно
  `low`/`medium`/`high` — проверять эмпирически).
- Формат ответа просите в конце user‑сообщения:
  «В конце верни итог в блоке `<answer>...</answer>`».

## 5. Structured output

- **JSON:** только `deepseek-chat`, обязательно `response_format` + пример
  схемы в промте.
- **XML/шаблон:** дайте skeleton с плейсхолдерами и попросите заполнить.
  Работает лучше JSON, когда нужна свободная проза внутри полей.
- **Few‑shot:** 1–3 примера в `<examples>` дают больший прирост, чем
  длинные текстовые инструкции. Пример должен быть **байт‑в‑байт** того
  формата, что вы хотите на выходе.
- Показывайте **и плохой, и хороший** пример:
  «Плохо: X. Почему плохо: … Хорошо: Y».

## 6. Prompt caching

- Кэш работает по **байт‑идентичному префиксу**. Стабильную часть
  (system + инструкции + RAG‑контекст) держите **строго в начале** и не
  переставляйте.
- Экономия на входе — до ~10× (cache read $0.028 vs input $0.28 за 1M,
  `extensions/deepseek/models.ts:7`).
- Первый запрос почти всегда miss. Кэш‑юнит персистится после ~2 похожих
  запросов.
- **Меряйте**, а не гадайте: в ответе есть `prompt_cache_hit_tokens` и
  `prompt_cache_miss_tokens`.
- Красный флаг: full‑response cache‑hit > ~25% — вероятно, TTL/структура
  настроены так, что модель отвечает по устаревшему контексту.
- Соответствие внутреннему требованию OpenClaw — секция **Prompt Cache
  Stability** в `CLAUDE.md`. Никогда не переставляйте старые байты промта
  без необходимости.

## 7. Итеративная отладка промта

1. Стартуйте с минимального system + 1 few‑shot. Проверьте на 5–10 входах.
2. Что ломается — фиксируйте **отдельным правилом** в system, не
   переписывайте всё.
3. Правило игнорируется — переносите его в **конец user‑сообщения**.
4. Всё ещё не работает — давайте контрпример:
   «Плохо: X. Хорошо: Y».
5. Финальный шаг — заморозить префикс и включить измерение
   `prompt_cache_hit_tokens`.

## 8. Частые причины несоблюдения инструкций

- Противоречивые правила («будь кратким» + «объясняй подробно каждое
  решение»).
- Инструкции внутри пользовательских данных без обёртки → injection.
- Много ролей/персон в одном system.
- Отрицания без указания альтернативы («не используй markdown» без «пиши
  plain text»).
- Для reasoner: `system` вместо `user` для критичных требований.
- Переставленный префикс промта → кэш‑мисс + иногда сбой формата.

## 9. Мини‑шаблоны

### Извлечение данных → JSON

```json
system: |
  Ты извлекаешь структурированные данные. Отвечай ТОЛЬКО валидным JSON
  по схеме ниже. Не добавляй markdown‑ограждения и пояснения.
  Схема: {"name": string, "age": integer, "tags": string[]}
user: |
  <user_input>
  Иван, 32 года, интересы: спорт, чтение
  </user_input>
  <task>Верни JSON по схеме.</task>
```
API: `temperature: 0`, `response_format: {type: "json_object"}`, `deepseek-chat`.

### Код‑ревью

```
system: |
  Ты senior TypeScript‑ревьюер. Формат ответа: список пунктов,
  каждый ≤ 2 предложений. Отмечай только реальные баги и утечки типов.
  Ничего не переписывай — только указывай место и суть.
user: |
  <diff>
  ...unified diff...
  </diff>
  <task>Дай список замечаний.</task>
```

### Reasoner для планирования

```
user: |
  <problem>...</problem>
  <constraints>...</constraints>
  Составь план из шагов. В конце верни итог в блоке <plan>...</plan>.
```
API: без `temperature`/`top_p`. Из истории убирайте `reasoning_content`.

---

## Источники

- https://api-docs.deepseek.com/guides/reasoning_model
- https://api-docs.deepseek.com/guides/thinking_mode/
- https://api-docs.deepseek.com/guides/kv_cache/
- https://api-docs.deepseek.com/quick_start/pricing
- https://www.sitepoint.com/deepseek-v32-the-complete-developer-guide-2026/
- https://takovibe.com/blog/prompt-engineering-with-deepseek/
- https://deepseekai.guide/tutorials/deepseek-prompt-engineering/
- https://deepseekv4pro.com/guides/deepseek-context-caching-hit-rules
- https://ofox.ai/blog/deepseek-r1-reasoning-api-production-english-2026/

Файлы в репо: `extensions/deepseek/index.ts`, `extensions/deepseek/models.ts`,
`extensions/deepseek/provider-catalog.ts`, `docs/providers/deepseek.md`,
`src/shared/text/model-special-tokens.ts`.
