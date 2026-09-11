/**
 * Zwischenablage mit Fallback.
 *
 * `navigator.clipboard` kann still scheitern (Fokus, Berechtigungen, Kontext).
 * Deshalb gibt es einen `<textarea>`+`execCommand`-Fallback, und der Aufrufer
 * bekommt ein klares true/false zurück.
 */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback unten versuchen
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
