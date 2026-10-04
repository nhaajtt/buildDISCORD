// Temporary voice rooms read their settings each time someone joins a lobby, so saving the settings needs nothing to be rebuilt.
// The dashboard calls this after a save; it exists so the call has somewhere to land and so a later change has a place to go.
export async function syncTempVoice() {
  return { ok: true };
}
