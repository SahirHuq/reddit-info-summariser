// The front end calls this on load to decide how AI and Reddit features behave.
// "server-key": the deployment has ANTHROPIC_API_KEY set, so AI works for every visitor.
// "byok": no server key, so each visitor pastes their own key in Settings.
// Reddit is reported as not configured: this build runs on demo data only.
export function GET() {
  const aiMode = process.env.ANTHROPIC_API_KEY ? "server-key" : "byok";
  return Response.json({
    ok: true,
    ai: { mode: aiMode },
    reddit: { configured: false, connected: false, username: null },
  });
}
