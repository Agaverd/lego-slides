type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string };

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (options: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void; error_callback?: (error: { type?: string }) => void }) => { requestAccessToken: (options?: { prompt?: string }) => void } } } };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleIdentity() {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("Google Identity недоступен")), { once: true }); return; }
    const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true; script.onload = () => resolve(); script.onerror = () => reject(new Error("Google Identity недоступен")); document.head.append(script);
  });
  return scriptPromise;
}

export async function requestGoogleDriveToken(clientId: string) {
  await loadGoogleIdentity();
  return await new Promise<string>((resolve, reject) => {
    const client = window.google?.accounts.oauth2.initTokenClient({ client_id: clientId, scope: "https://www.googleapis.com/auth/drive.file", callback: (response) => response.access_token ? resolve(response.access_token) : reject(new Error(response.error_description || response.error || "Google не выдал доступ")), error_callback: () => reject(new Error("Подключение Google отменено")) });
    if (!client) { reject(new Error("Google Identity не загрузился")); return; }
    client.requestAccessToken({ prompt: "consent" });
  });
}
