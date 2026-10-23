const BAD_WORDS = [
  "ебалово",
  "шлюха",
  "хуевая",
  "хуеплет",
  "пизда",
  "ебалай",
  "еблан",
  "блядь",
  "блядота",
  "сука",
  "сучка",
  "мразь",
  "долбоеб",
  "дебил",
]
const MAX_WARNINGS = 3
const MUTE_TIME = 60 * 60
const warnings = new Map()
async function isAdmin(ctx, userId = ctx.from?.id) {
  if (!userId) return false
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
function containsBadWord(text) {
  const normalized = text
    .toLowerCase()
    .replace(/ё/g, "е")
  return BAD_WORDS.some((word) =>
    normalized.includes(word)
  )
}
function containsLink(text) {
  return /(https?:\/\/|www\.|t\.me\/|telegram\.me\/)/i.test(text)
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
      await ctx.reply("🔇 3 предупреждения. Пользователь получил мут на 1 час.")
    } catch {
      await ctx.reply(
        "⚠️ 3 предупреждения, но я не смог выдать мут. Проверь права бота."
      )
    }
    return
  }
  await ctx.reply(`⚠️ Предупреждение ${count}/${MAX_WARNINGS}`)
}
export function registerCommands(bot) {
  // =========================
  // ОСНОВНЫЕ КОМАНДЫ
  // =========================
  bot.command("start", (ctx) =>
    ctx.reply("🛡 Бот-модератор работает!")
  )
  bot.command("ping", (ctx) =>
    ctx.reply("🏓 pong")
  )
  bot.command("help", (ctx) =>
    ctx.reply(
      [
        "🛡 Команды:",
        "",
        "/start — запустить бота",
        "/ping — проверить работу",
        "/help — помощь",
        "",
        "Модерация:",
        "/warn — предупреждение",
        "/mute — мут на 1 час",
        "/ban — бан",
        "/unban — снять бан",
      ].join("\n")
    )
  )
  // =========================
  // WARN
  // =========================
  bot.command("warn", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ Только для администраторов.")
    }
    const reply = ctx.message?.reply_to_message
    if (!reply?.from) {
      return ctx.reply(
        "Ответь командой /warn на сообщение пользователя."
      )
    }
    if (await isAdmin(ctx, reply.from.id)) {
      return ctx.reply("❌ Нельзя предупредить администратора.")
    }
    await warnUser(ctx, reply.from.id)
  })
  // =========================
  // MUTE
  // =========================
  bot.command("mute", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ Только для администраторов.")
    }
    const reply = ctx.message?.reply_to_message
    if (!reply?.from) {
      return ctx.reply(
        "Ответь командой /mute на сообщение пользователя."
      )
    }
    if (await isAdmin(ctx, reply.from.id)) {
      return ctx.reply("❌ Нельзя замутить администратора.")
    }
    try {
      await ctx.api.restrictChatMember(
        ctx.chat.id,
        reply.from.id,
        {
          permissions: {
            can_send_messages: false,
          },
          until_date:
            Math.floor(Date.now() / 1000) + MUTE_TIME,
        }
      )
      await ctx.reply("🔇 Пользователь получил мут на 1 час.")
    } catch {
      await ctx.reply(
        "❌ Не удалось выдать мут. Проверь права бота."
      )
    }
  })
  // =========================
  // BAN
  // =========================
  bot.command("ban", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ Только для администраторов.")
    }
    const reply = ctx.message?.reply_to_message
    if (!reply?.from) {
      return ctx.reply(
        "Ответь командой /ban на сообщение пользователя."
      )
    }
    if (await isAdmin(ctx, reply.from.id)) {
      return ctx.reply("❌ Нельзя забанить администратора.")
    }
    try {
      await ctx.api.banChatMember(
        ctx.chat.id,
        reply.from.id
      )
      await ctx.reply("🚫 Пользователь заблокирован.")
    } catch {
      await ctx.reply(
        "❌ Не удалось заблокировать пользователя."
      )
    }
  })
  // =========================
  // UNBAN
  // =========================
  bot.command("unban", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ Только для администраторов.")
    }
    const reply = ctx.message?.reply_to_message
    if (!reply?.from) {
      return ctx.reply(
        "Ответь командой /unban на сообщение пользователя."
      )
    }
    try {
      await ctx.api.unbanChatMember(
        ctx.chat.id,
        reply.from.id,
        {
          only_if_banned: true,
        }
      )
      await ctx.reply("✅ Бан снят.")
    } catch {
      await ctx.reply("❌ Не удалось снять бан.")
    }
  })
  // =========================
  // АВТОМОДЕРАЦИЯ
  // =========================
  bot.on("message:text", async (ctx) => {
    // Только группы
    if (
      ctx.chat.type !== "group" &&
      ctx.chat.type !== "supergroup"
    ) {
      return
    }
    const text = ctx.message.text
    // Команды не проверяем
    if (text.startsWith("/")) return
    // Администраторов не трогаем
    if (await isAdmin(ctx)) return
    // Мат
    if (containsBadWord(text)) {
      try {
        await ctx.deleteMessage()
      } catch {
        return
      }
      await warnUser(ctx, ctx.from.id)
      return
    }
    // Ссылки
    if (containsLink(text)) {
      try {
        await ctx.deleteMessage()
      } catch {
        return
      }
      await ctx.reply(
        `🔗 @${ctx.from.username ?? ctx.from.first_name}, ссылки в этом чате запрещены.`
      )
    }
  })
}
