const BASE_URL = "https://api.tildacdn.info/v1";
const TIMEOUT = 10_000;
const MAX_RETRIES = 3;

export async function tildaGet(method: string, params: Record<string, string> = {}): Promise<unknown> {
  const publicKey = process.env.TILDA_PUBLIC_KEY;
  const secretKey = process.env.TILDA_SECRET_KEY;
  if (!publicKey || !secretKey) throw new Error("TILDA_PUBLIC_KEY и TILDA_SECRET_KEY не заданы");

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);

    const query = new URLSearchParams({
      ...params,
      publickey: publicKey,
      secretkey: secretKey,
    });

    try {
      const response = await fetch(`${BASE_URL}/${method}/?${query.toString()}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json() as { status?: string; result?: unknown; message?: string };
        if (data.status === "ERROR") throw new Error(`Tilda ошибка: ${data.message ?? "неизвестная ошибка"}`);
        return data.result ?? data;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
        console.error(`[tilda-mcp] ${response.status}, повтор через ${delay}мс (${attempt}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw new Error(`Tilda HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof DOMException && error.name === "AbortError" && attempt < MAX_RETRIES) {
        console.error(`[tilda-mcp] Таймаут, повтор (${attempt}/${MAX_RETRIES})`);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Tilda API: все попытки исчерпаны");
}

// Exported for testing — allows injecting a mock fetch
export { BASE_URL, TIMEOUT, MAX_RETRIES };
