export function registerCommands(bot) {
  bot.command("ping", (ctx) => ctx.reply("🏓 pong"))

  bot.command("start", (ctx) =>
    ctx.reply("Бот работает! ✅")
  )

  bot.on("message:text", (ctx) =>
    ctx.reply(`Получил: ${ctx.message.text}`)
  )
}
