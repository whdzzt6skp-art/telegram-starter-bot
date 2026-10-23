import { InlineKeyboard } from "grammy"

// ───── НАСТРОЙКИ ─────

const BAD_WORDS = [
  "хуй",
  "хуевый",
  "пизданутый",
  "ебанат",
  "ебанутый",
  "блядь",
  "сука",
  "мразь",
  "шлюха",
  "гандон",
  "долбоеб",
]

const MAX_WARNINGS = 3

// ───── ПРОВЕРКА АДМИНА ─────

async function isAdmin(ctx, userId) {
  if (!ctx.chat) return false

  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, userId)

    return (
      member.status === "administrator" ||
      member.status === "creator"
    )
  } catch {
    return false
  }
}

// ───── ХРАНИЛИЩЕ ПРЕДУПРЕЖДЕНИЙ ─────

const warnings = new Map()

function getWarningKey(chatId, userId) {
  return `${chatId}:${userId}`
}

function getWarnings(chatId, userId) {
  return warnings.get(getWarningKey(chatId, userId)) || 0
}

function addWarning(chatId, userId) {
  const key = getWarningKey(chatId, userId)
  const count = getWarnings(chatId, userId) + 1

  warnings.set(key, count)

  return count
}

function clearWarnings(chatId, userId) {
  warnings.delete(getWarningKey(chatId, userId))
}

// ───── ПРОВЕРКА СООБЩЕНИЯ ─────

function containsBadWord(text) {
  const message = text.toLowerCase()

  return BAD_WORDS.some((word) => message.includes(word))
}

function containsLink(text) {
  return /(https?:\/\/|www\.|t\.me\/|telegram\.me\/)/i.test(text)
}

// ───── МОДЕРАЦИЯ ─────

async function moderateMessage(ctx) {
  if (!ctx.chat || !ctx.from || !ctx.message?.text) return

  // Не трогаем личные сообщения
  if (ctx.chat.type === "private") return

  // Не трогаем администраторов
  if (await isAdmin(ctx, ctx.from.id)) return

  const text = ctx.message.text

  if (!containsBadWord(text) && !containsLink(text)) return

  try {
    await ctx.api.deleteMessage(
      ctx.chat.id,
      ctx.message.message_id
    )
  } catch (error) {
    console.error("Не удалось удалить сообщение:", error)
    return
  }

  const warningCount = addWarning(
    ctx.chat.id,
    ctx.from.id
  )

  const name =
    ctx.from.first_name ||
    ctx.from.username ||
    "Пользователь"

  if (warningCount >= MAX_WARNINGS) {
    try {
      await ctx.api.restrictChatMember(
        ctx.chat.id,
        ctx.from.id,
        {
          permissions: {
            can_send_messages: false,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_video_notes: false,
            can_send_voice_notes: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
            can_change_info: false,
            can_invite_users: false,
            can_pin_messages: false
          }
        }
      )

      clearWarnings(ctx.chat.id, ctx.from.id)

      await ctx.reply(
        `🔇 ${name} получил 3 предупреждения и был замьючен.`
      )
    } catch (error) {
      console.error("Не удалось выдать мут:", error)

      await ctx.reply(
        `⚠️ ${name}, у тебя 3/3 предупреждений.\nБот не смог выдать мут — проверь права администратора.`
      )
    }

    return
  }

  await ctx.reply(
    `⚠️ ${name}, нарушение правил.\nПредупреждение: ${warningCount}/${MAX_WARNINGS}`
  )
}

// ───── КОМАНДЫ ─────

export function registerCommands(bot) {

  bot.command("start", (ctx) =>
    ctx.reply(
      "🛡 Модератор запущен.\n\nИспользуй /help, чтобы посмотреть команды."
    )
  )

  bot.command("help", (ctx) =>
    ctx.reply(
      [
        "🛡 КОМАНДЫ МОДЕРАТОРА",
        "",
        "/id — узнать ID чата и пользователя",
        "/warn — выдать предупреждение",
        "/unwarn — снять предупреждения",
        "/mute — выдать мут",
        "/unmute — снять мут",
        "/ban — заблокировать пользователя",
        "/unban — разблокировать пользователя",
        "",
        "Автоматически удаляются:",
        "• мат",
        "• запрещённые слова",
        "• ссылки",
        "",
        "3 нарушения → мут."
      ].join("\n")
    )
  )

  // ID
  bot.command("id", async (ctx) => {
    await ctx.reply(
      `Chat ID: ${ctx.chat.id}\nUser ID: ${ctx.from?.id ?? "unknown"}`
    )
  })

  // WARN
  bot.command("warn", async (ctx) => {
    if (!ctx.message?.reply_to_message) {
      return ctx.reply("⚠️ Используй /warn ответом на сообщение пользователя.")
    }

    if (!(await isAdmin(ctx, ctx.from.id))) {
      return ctx.reply("❌ Эта команда только для администраторов.")
    }

    const user = ctx.message.reply_to_message.from

    if (!user) return

    if (await isAdmin(ctx, user.id)) {
      return ctx.reply("❌ Нельзя выдать предупреждение администратору.")
    }

    const count = addWarning(ctx.chat.id, user.id)

    await ctx.reply(
      `⚠️ ${user.first_name} получил предупреждение.\n\nПредупреждений: ${count}/${MAX_WARNINGS}`
    )

    if (count >= MAX_WARNINGS) {
      try {
        await ctx.api.restrictChatMember(
          ctx.chat.id,
          user.id,
          {
            permissions: {
              can_send_messages: false
            }
          }
        )

        clearWarnings(ctx.chat.id, user.id)

        await ctx.reply(
          `🔇 ${user.first_name} получил 3 предупреждения и был замьючен.`
        )
      } catch {
        await ctx.reply(
          "⚠️ Не удалось выдать мут. Проверь права бота."
        )
      }
    }
  })

  // UNWARN
  bot.command("unwarn", async (ctx) => {
    if (!ctx.message?.reply_to_message) {
      return ctx.reply("⚠️ Используй /unwarn ответом на сообщение пользователя.")
    }

    if (!(await isAdmin(ctx, ctx.from.id))) {
      return ctx.reply("❌ Эта команда только для администраторов.")
    }

    const user = ctx.message.reply_to_message.from

    if (!user) return

    clearWarnings(ctx.chat.id, user.id)

    await ctx.reply(
      `✅ Предупреждения ${user.first_name} сброшены.`
    )
  })

  // MUTE
  bot.command("mute", async (ctx) => {
    if (!(await isAdmin(ctx, ctx.from.id))) {
      return ctx.reply("❌ Эта команда только для администраторов.")
    }

    if (!ctx.message?.reply_to_message) {
      return ctx.reply("⚠️ Используй /mute ответом на сообщение пользователя.")
    }

    const user = ctx.message.reply_to_message.from

    if (!user) return

    if (await isAdmin(ctx, user.id)) {
      return ctx.reply("❌ Нельзя замьютить администратора.")
    }

    try {
      await ctx.api.restrictChatMember(
        ctx.chat.id,
        user.id,
        {
          permissions: {
            can_send_messages: false
          }
        }
      )

      await ctx.reply(
        `🔇 ${user.first_name} получил мут.`
      )
    } catch {
      await ctx.reply(
        "❌ Не удалось выдать мут. Проверь права бота."
      )
    }
  })

  // UNMUTE
  bot.command("unmute", async (ctx) => {
    if (!(await isAdmin(ctx, ctx.from.id))) {
      return ctx.reply("❌ Эта команда только для администраторов.")
    }

    if (!ctx.message?.reply_to_message) {
      return ctx.reply("⚠️ Используй /unmute ответом на сообщение пользователя.")
    }

    const user = ctx.message.reply_to_message.from

    if (!user) return

    try {
      await ctx.api.restrictChatMember(
        ctx.chat.id,
        user.id,
        {
          permissions: {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true
          }
        }
      )

      await ctx.reply(
        `🔊 ${user.first_name} снова может писать.`
      )
    } catch {
      await ctx.reply(
        "❌ Не удалось снять мут."
      )
    }
  })

  // BAN
  bot.command("ban", async (ctx) => {
    if (!(await isAdmin(ctx, ctx.from.id))) {
      return ctx.reply("❌ Эта команда только для администраторов.")
    }

    if (!ctx.message?.reply_to_message) {
      return ctx.reply("⚠️ Используй /ban ответом на сообщение пользователя.")
    }

    const user = ctx.message.reply_to_message.from

    if (!user) return

    if (await isAdmin(ctx, user.id)) {
      return ctx.reply("❌ Нельзя забанить администратора.")
    }

    try {
      await ctx.api.banChatMember(
        ctx.chat.id,
        user.id
      )

      await ctx.reply(
        `🔨 ${user.first_name} заблокирован.`
      )
    } catch {
      await ctx.reply(
        "❌ Не удалось заблокировать пользователя."
      )
    }
  })

  // UNBAN
  bot.command("unban", async (ctx) => {
    if (!(await isAdmin(ctx, ctx.from.id))) {
      return ctx.reply("❌ Эта команда только для администраторов.")
    }

    if (!ctx.message?.reply_to_message) {
      return ctx.reply("⚠️ Используй /unban ответом на сообщение пользователя.")
    }

    const user = ctx.message.reply_to_message.from

    if (!user) return

    try {
      await ctx.api.unbanChatMember(
        ctx.chat.id,
        user.id
      )

      await ctx.reply(
        `✅ ${user.first_name} разблокирован.`
      )
    } catch {
      await ctx.reply(
        "❌ Не удалось разблокировать пользователя."
      )
    }
  })

  // АВТОМОДЕРАЦИЯ
  bot.on("message:text", async (ctx) => {
    await moderateMessage(ctx)
  })
}
