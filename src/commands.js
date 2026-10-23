
const DEFAULT_BAD_WORDS = [
  "шлюха",
  "мамка",
  "хуевая",
  "пиздализ",
  "пиздабол",
  "ебанат",
  "ебло",
  "ебало",
  "блядота",
  "сучка",
  "сука",
  "мразь",
  "долбоеб",
  "блядь",
]

const badWords = new Set(DEFAULT_BAD_WORDS)

const MAX_WARNINGS = 3
const MUTE_TIME = 60 * 60

// Антиспам: не больше 5 сообщений за 8 секунд
const SPAM_LIMIT = 5
const SPAM_WINDOW = 8000

// Повтор одного сообщения в течение 30 секунд
const REPEAT_WINDOW = 30000

// Антикапс: минимум 10 букв, более 70% заглавных
const CAPS_MIN_LETTERS = 10
const CAPS_RATIO = 0.7

const warnings = new Map()
const recentMessages = new Map()
const lastMessages = new Map()

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim()
}

async function isAdmin(ctx, userId = ctx.from?.id) {
  if (!userId || !ctx.chat) return false

  try {
    const member = await ctx.api.getChatMember(
      ctx.chat.id,
      userId
    )

    return (
      member.status === "administrator" ||
      member.status === "creator"
    )
  } catch {
    return false
  }
}

function containsBadWord(text) {
  const normalized = normalize(text)

  return [...badWords].some(word =>
    normalized.includes(normalize(word))
  )
}

function containsLink(text) {
  return /(https?:\/\/|www\.|t\.me\/|telegram\.me\/)/i.test(text)
}

function isCaps(text) {
  const letters = text.match(/[a-zа-яё]/gi) || []
  const uppercase = text.match(/[A-ZА-ЯЁ]/g) || []

  return (
    letters.length >= CAPS_MIN_LETTERS &&
    uppercase.length / letters.length > CAPS_RATIO
  )
}

async function warnUser(ctx, userId) {
  const key = `${ctx.chat.id}:${userId}`
  const count = (warnings.get(key) || 0) + 1

  warnings.set(key, count)

  if (count >= MAX_WARNINGS) {
    try {
      await ctx.api.restrictChatMember(
        ctx.chat.id,
        userId,
        {
          permissions: {
            can_send_messages: false,
          },
          until_date:
            Math.floor(Date.now() / 1000) + MUTE_TIME,
        }
      )

      warnings.delete(key)

      await ctx.reply(
        "🔇 3 предупреждения. Пользователь получил мут на 1 час."
      )
    } catch {
      await ctx.reply(
        "⚠️ 3 предупреждения, но выдать мут не удалось. Проверь права бота."
      )
    }

    return
  }

  await ctx.reply(
    `⚠️ Предупреждение ${count}/${MAX_WARNINGS}`
  )
}

async function deleteAndWarn(ctx, reason) {
  try {
    await ctx.deleteMessage()
  } catch {
    // Если сообщение нельзя удалить, не продолжаем наказание
    return
  }

  await ctx.reply(reason)
  await warnUser(ctx, ctx.from.id)
}

export function registerCommands(bot) {
  // Основные команды

  bot.command("start", ctx =>
    ctx.reply("🛡 Бот-модератор работает!")
  )

  bot.command("ping", ctx =>
    ctx.reply("🏓 pong")
  )

  bot.command("help", ctx =>
    ctx.reply(
      [
        "🛡 Команды бота:",
        "",
        "/start — запуск",
        "/ping — проверка работы",
        "/help — помощь",
        "",
        "Модерация (ответь командой на сообщение):",
        "/warn — предупреждение",
        "/mute — мут на 1 час",
        "/ban — бан",
        "/unban — снять бан",
        "",
        "Запрещённые слова (для администраторов):",
        "/words — список слов",
        "/addword слово — добавить слово",
        "/delword слово — удалить слово",
      ].join("\n")
    )
  )

  // Добавить запрещённое слово

  bot.command("addword", async ctx => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ Только для администраторов.")
    }

    const word = String(ctx.match || "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")

    if (!word || /\s/.test(word) || word.startsWith("/")) {
      return ctx.reply(
        "Использование: /addword слово"
      )
    }

    if (badWords.has(word)) {
      return ctx.reply("ℹ️ Это слово уже в списке.")
    }

    badWords.add(word)

    await ctx.reply(
      `✅ Слово «${word}» добавлено в фильтр.`
    )
  })

  // Удалить запрещённое слово

  bot.command("delword", async ctx => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ Только для администраторов.")
    }

    const word = String(ctx.match || "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")

    if (!word) {
      return ctx.reply(
        "Использование: /delword слово"
      )
    }

    if (!badWords.has(word)) {
      return ctx.reply("ℹ️ Такого слова нет в списке.")
    }

    badWords.delete(word)

    await ctx.reply(
      `✅ Слово «${word}» удалено из фильтра.`
    )
  })

  // Показать список запрещённых слов

  bot.command("words", async ctx => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ Только для администраторов.")
    }

    await ctx.reply(
      "🚫 Запрещённые слова:\n\n" +
      [...badWords].sort().join(", ")
    )
  })

  // Предупреждение

  bot.command("warn", async ctx => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ Только для администраторов.")
    }

    const user = ctx.message?.reply_to_message?.from

    if (!user) {
      return ctx.reply(
        "Ответь командой /warn на сообщение участника."
      )
    }

    if (await isAdmin(ctx, user.id)) {
      return ctx.reply(
        "❌ Нельзя предупредить администратора."
      )
    }

    await warnUser(ctx, user.id)
  })

  // Мут на час

  bot.command("mute", async ctx => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ Только для администраторов.")
    }

    const user = ctx.message?.reply_to_message?.from

    if (!user) {
      return ctx.reply(
        "Ответь командой /mute на сообщение участника."
      )
    }

    if (await isAdmin(ctx, user.id)) {
      return ctx.reply(
        "❌ Нельзя замутить администратора."
      )
    }

    try {
      await ctx.api.restrictChatMember(
        ctx.chat.id,
        user.id,
        {
          permissions: {
            can_send_messages: false,
          },
          until_date:
            Math.floor(Date.now() / 1000) + MUTE_TIME,
        }
      )

      await ctx.reply("🔇 Мут выдан на 1 час.")
    } catch {
      await ctx.reply(
        "❌ Не удалось выдать мут. Проверь права бота."
      )
    }
  })

  // Бан

  bot.command("ban", async ctx => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ Только для администраторов.")
    }

    const user = ctx.message?.reply_to_message?.from

    if (!user) {
      return ctx.reply(
        "Ответь командой /ban на сообщение участника."
      )
    }

    if (await isAdmin(ctx, user.id)) {
      return ctx.reply(
        "❌ Нельзя забанить администратора."
      )
    }

    try {
      await ctx.api.banChatMember(
        ctx.chat.id,
        user.id
      )

      await ctx.reply("🚫 Пользователь заблокирован.")
    } catch {
      await ctx.reply("❌ Не удалось забанить пользователя.")
    }
  })

  // Снять бан

  bot.command("unban", async ctx => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ Только для администраторов.")
    }

    const user = ctx.message?.reply_to_message?.from

    if (!user) {
      return ctx.reply(
        "Ответь командой /unban на сообщение пользователя."
      )
    }

    try {
      await ctx.api.unbanChatMember(
        ctx.chat.id,
        user.id,
        { only_if_banned: true }
      )

      await ctx.reply("✅ Бан снят.")
    } catch {
      await ctx.reply("❌ Не удалось снять бан.")
    }
  })

  // Приветствие новых участников

  bot.on("message:new_chat_members", async ctx => {
    const members = ctx.message.new_chat_members || []

    for (const member of members) {
      if (member.is_bot) continue

      const name = member.first_name || "друг"

      await ctx.reply(
        `👋 Добро пожаловать, ${name}!\n` +
        "❤️ Рады видеть тебя в нашем чате. " +
        "Соблюдай правила и будь дружелюбным!"
      )
    }
  })

  // Автомодерация текстовых сообщений

  bot.on("message:text", async ctx => {
    if (
      ctx.chat.type !== "group" &&
      ctx.chat.type !== "supergroup"
    ) {
      return
    }

    const text = ctx.message.text

    // Не обрабатываем команды
    if (text.startsWith("/")) return

    // Не модерируем администраторов
    if (await isAdmin(ctx)) return

    if (!ctx.from) return

    const userId = ctx.from.id
    const chatId = ctx.chat.id
    const key = `${chatId}:${userId}`
    const now = Date.now()

    // Запрещённые слова

    if (containsBadWord(text)) {
      return deleteAndWarn(
        ctx,
        "🤬 Мат в чате запрещён."
      )
    }

    // Ссылки

    if (containsLink(text)) {
      return deleteAndWarn(
        ctx,
        "🔗 Ссылки в этом чате запрещены."
      )
    }

    // Капс

    if (isCaps(text)) {
      return deleteAndWarn(
        ctx,
        "🔠 Не пиши сообщения целиком заглавными буквами."
      )
    }

    // Повторяющиеся сообщения

    const normalizedText = normalize(text)
    const previous = lastMessages.get(key)

    if (
      previous &&
      previous.text === normalizedText &&
      now - previous.time < REPEAT_WINDOW
    ) {
      return deleteAndWarn(
        ctx,
        "🔁 Не отправляй одно и то же сообщение повторно."
      )
    }

    lastMessages.set(key, {
      text: normalizedText,
      time: now,
    })

    // Антиспам: 6-е сообщение за 8 секунд удаляется

    let timestamps = recentMessages.get(key) || []

    timestamps = timestamps.filter(
      time => now - time < SPAM_WINDOW
    )

    timestamps.push(now)
    recentMessages.set(key, timestamps)

    if (timestamps.length > SPAM_LIMIT) {
      return deleteAndWarn(
        ctx,
        "🚫 Слишком много сообщений подряд. Не спамь."
      )
    }
  })
}
